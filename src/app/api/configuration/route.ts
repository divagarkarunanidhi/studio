import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/options';
import { getMongoDetails } from '@/lib/mongodb';

const COLLECTION = 'appConfiguration';
const DOC_ID = 'global';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { client, dbName } = await getMongoDetails();
    const db = client.db(dbName);
    const doc = await db.collection(COLLECTION).findOne({ _id: DOC_ID as any });
    if (!doc) {
      return NextResponse.json({ config: null });
    }
    const { _id, ...config } = doc as any;
    return NextResponse.json({ config });
  } catch (e: any) {
    console.error('GET /api/configuration error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  try {
    const { client, dbName } = await getMongoDetails();
    const db = client.db(dbName);
    await db.collection(COLLECTION).updateOne(
      { _id: DOC_ID as any },
      { $set: { ...body, updatedAt: new Date() } },
      { upsert: true }
    );
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('PUT /api/configuration error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
