import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/options';
import { getMongoDetails } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

const RESERVED = new Set(['admin', 'system.users', 'system.roles']);

function isValidCollection(name: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_]{0,80}$/.test(name) && !RESERVED.has(name);
}

function serialize(doc: any): any {
  if (!doc) return doc;
  const out: any = { ...doc };
  if (out._id !== undefined) {
    out.id = typeof out._id === 'string' ? out._id : out._id.toString();
    delete out._id;
  }
  return out;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ collection: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { collection } = await params;
  if (!isValidCollection(collection)) {
    return NextResponse.json({ error: 'Invalid collection name' }, { status: 400 });
  }

  const url = new URL(req.url);
  const orderBy = url.searchParams.get('orderBy'); // "field:asc" or "field:desc"
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 0, 0), 1000) : 0;

  try {
    const { client, dbName } = await getMongoDetails();
    const db = client.db(dbName);
    let cursor = db.collection(collection).find({});
    if (orderBy) {
      const [field, dir] = orderBy.split(':');
      cursor = cursor.sort({ [field]: dir === 'desc' ? -1 : 1 });
    }
    if (limit > 0) cursor = cursor.limit(limit);
    const docs = await cursor.toArray();
    return NextResponse.json({ data: docs.map(serialize) });
  } catch (err: any) {
    console.error(`[mongo:${collection}] GET failed`, err);
    return NextResponse.json({ error: err?.message || 'Read failed' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ collection: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { collection } = await params;
  if (!isValidCollection(collection)) {
    return NextResponse.json({ error: 'Invalid collection name' }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Body must be an object' }, { status: 400 });
  }

  // Strip client-provided id; let Mongo assign one.
  const { id: _ignoredId, _id: _ignoredMongoId, ...payload } = body;

  try {
    const { client, dbName } = await getMongoDetails();
    const db = client.db(dbName);
    const result = await db.collection(collection).insertOne({
      ...payload,
      createdAt: payload.createdAt ?? new Date().toISOString(),
    });
    return NextResponse.json({ id: result.insertedId.toString() }, { status: 201 });
  } catch (err: any) {
    console.error(`[mongo:${collection}] POST failed`, err);
    return NextResponse.json({ error: err?.message || 'Insert failed' }, { status: 500 });
  }
}

export { isValidCollection, serialize };
