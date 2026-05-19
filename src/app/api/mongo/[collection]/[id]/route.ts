import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/options';
import { getMongoDetails } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

const RESERVED = new Set(['admin', 'system.users', 'system.roles']);

function isValidCollection(name: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_]{0,80}$/.test(name) && !RESERVED.has(name);
}

function buildIdFilter(id: string): any {
  // Try ObjectId first if it looks like one, otherwise use string _id.
  if (/^[a-f0-9]{24}$/i.test(id)) {
    return { $or: [{ _id: new ObjectId(id) }, { _id: id }] };
  }
  return { _id: id };
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
  _req: NextRequest,
  { params }: { params: Promise<{ collection: string; id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { collection, id } = await params;
  if (!isValidCollection(collection)) {
    return NextResponse.json({ error: 'Invalid collection name' }, { status: 400 });
  }

  try {
    const { client, dbName } = await getMongoDetails();
    const db = client.db(dbName);
    const doc = await db.collection(collection).findOne(buildIdFilter(id));
    if (!doc) return NextResponse.json({ data: null }, { status: 200 });
    return NextResponse.json({ data: serialize(doc) });
  } catch (err: any) {
    console.error(`[mongo:${collection}/${id}] GET failed`, err);
    return NextResponse.json({ error: err?.message || 'Read failed' }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ collection: string; id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { collection, id } = await params;
  if (!isValidCollection(collection)) {
    return NextResponse.json({ error: 'Invalid collection name' }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const merge = req.nextUrl.searchParams.get('merge') === 'true';
  const { id: _i, _id: _m, ...payload } = body || {};

  try {
    const { client, dbName } = await getMongoDetails();
    const db = client.db(dbName);
    const filter = buildIdFilter(id);
    const baseId = /^[a-f0-9]{24}$/i.test(id) ? id : id;
    if (merge) {
      await db.collection(collection).updateOne(
        filter,
        { $set: { ...payload, updatedAt: new Date().toISOString() } },
        { upsert: true }
      );
    } else {
      // Replace, but preserve _id semantics. Use upsert so new docs work.
      const replacement: any = { ...payload, updatedAt: new Date().toISOString() };
      // For string IDs (like "global"), set _id explicitly so upsert places it under that id.
      if (!/^[a-f0-9]{24}$/i.test(id)) {
        replacement._id = id;
      }
      await db.collection(collection).replaceOne(filter, replacement, { upsert: true });
    }
    return NextResponse.json({ id: baseId, ok: true });
  } catch (err: any) {
    console.error(`[mongo:${collection}/${id}] PUT failed`, err);
    return NextResponse.json({ error: err?.message || 'Write failed' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ collection: string; id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { collection, id } = await params;
  if (!isValidCollection(collection)) {
    return NextResponse.json({ error: 'Invalid collection name' }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { id: _i, _id: _m, ...payload } = body || {};

  try {
    const { client, dbName } = await getMongoDetails();
    const db = client.db(dbName);
    const result = await db.collection(collection).updateOne(
      buildIdFilter(id),
      { $set: { ...payload, updatedAt: new Date().toISOString() } }
    );
    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ id, ok: true });
  } catch (err: any) {
    console.error(`[mongo:${collection}/${id}] PATCH failed`, err);
    return NextResponse.json({ error: err?.message || 'Update failed' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ collection: string; id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { collection, id } = await params;
  if (!isValidCollection(collection)) {
    return NextResponse.json({ error: 'Invalid collection name' }, { status: 400 });
  }

  try {
    const { client, dbName } = await getMongoDetails();
    const db = client.db(dbName);
    await db.collection(collection).deleteOne(buildIdFilter(id));
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error(`[mongo:${collection}/${id}] DELETE failed`, err);
    return NextResponse.json({ error: err?.message || 'Delete failed' }, { status: 500 });
  }
}
