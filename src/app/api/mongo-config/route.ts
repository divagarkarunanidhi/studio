import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { MongoClient } from 'mongodb';
import { authOptions } from '@/app/api/auth/[...nextauth]/options';
import { getMongoConfig, saveMongoConfig } from '@/lib/mongo-config';
import { resetMongoConnection } from '@/lib/mongodb';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const config = await getMongoConfig();
    return NextResponse.json({ config });
  } catch (e: any) {
    console.error('GET /api/mongo-config error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { uri?: string; dbName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const uri = (body.uri ?? '').trim();
  const dbName = (body.dbName ?? '').trim();

  if (!uri || !dbName) {
    return NextResponse.json(
      { error: 'Both uri and dbName are required.' },
      { status: 400 }
    );
  }

  // Validate the new URI by attempting a quick connection before persisting.
  const probe = new MongoClient(uri, { connectTimeoutMS: 5000, serverSelectionTimeoutMS: 5000 });
  try {
    await probe.connect();
    await probe.db(dbName).command({ ping: 1 });
  } catch (e: any) {
    return NextResponse.json(
      { error: `Connection test failed: ${e?.message ?? 'unknown error'}` },
      { status: 400 }
    );
  } finally {
    await probe.close().catch(() => {});
  }

  try {
    const saved = await saveMongoConfig({ uri, dbName });
    // Force the shared pool to drop and reconnect with the new values.
    await resetMongoConnection();
    return NextResponse.json({ config: saved });
  } catch (e: any) {
    console.error('PUT /api/mongo-config error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
