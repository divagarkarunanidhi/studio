/**
 * Firestore-compatible shim backed by Mongo CRUD endpoints.
 * Provides drop-in replacements for the subset of `firebase/firestore`
 * functions used by the app, so existing consumer code keeps compiling.
 *
 * Refs are plain objects carrying a `path` string (e.g. "col" or "col/id").
 * The hooks (`useDoc`, `useCollection`) and non-blocking writers translate
 * those paths into REST calls against `/api/mongo/...`.
 */

export type DocumentData = Record<string, any>;
export type SetOptions = { merge?: boolean };

export interface DocumentReference<T = DocumentData> {
  __ref: true;
  type: 'document';
  path: string;
  id: string;
  _col: string;
  _docId: string;
}

export interface CollectionReference<T = DocumentData> {
  __ref: true;
  type: 'collection';
  path: string;
  id: string;
  _col: string;
}

export interface QueryConstraint {
  kind: 'orderBy' | 'limit';
  field?: string;
  dir?: 'asc' | 'desc';
  n?: number;
}

export interface Query<T = DocumentData> {
  __ref: true;
  type: 'query';
  path: string;
  _col: string;
  _constraints: QueryConstraint[];
  // Mimic the internal shape used by the legacy useCollection error path.
  _query: { path: { canonicalString: () => string; toString: () => string } };
}

export class FirestoreError extends Error {
  code: string;
  constructor(message: string, code = 'unknown') {
    super(message);
    this.name = 'FirestoreError';
    this.code = code;
  }
}

export interface DocumentSnapshot<T = DocumentData> {
  id: string;
  exists: () => boolean;
  data: () => T | undefined;
}

export interface QuerySnapshot<T = DocumentData> {
  docs: Array<DocumentSnapshot<T> & { data: () => T }>;
  size: number;
  empty: boolean;
}

// ---- Reference builders -----------------------------------------------------

export function doc(_db: unknown, col: string, id: string): DocumentReference {
  return {
    __ref: true,
    type: 'document',
    path: `${col}/${id}`,
    id,
    _col: col,
    _docId: id,
  };
}

export function collection(_db: unknown, col: string): CollectionReference {
  return {
    __ref: true,
    type: 'collection',
    path: col,
    id: col,
    _col: col,
  };
}

export function query<T = DocumentData>(
  ref: CollectionReference<T> | Query<T>,
  ...constraints: QueryConstraint[]
): Query<T> {
  const existing = (ref as Query<T>)._constraints ?? [];
  const path = ref.path;
  return {
    __ref: true,
    type: 'query',
    path,
    _col: ref._col,
    _constraints: [...existing, ...constraints],
    _query: {
      path: {
        canonicalString: () => path,
        toString: () => path,
      },
    },
  };
}

export function orderBy(field: string, dir: 'asc' | 'desc' = 'asc'): QueryConstraint {
  return { kind: 'orderBy', field, dir };
}

export function limit(n: number): QueryConstraint {
  return { kind: 'limit', n };
}

// ---- Internal helpers -------------------------------------------------------

function constraintsToQueryString(constraints: QueryConstraint[] = []): string {
  const params = new URLSearchParams();
  for (const c of constraints) {
    if (c.kind === 'orderBy' && c.field) {
      params.set('orderBy', `${c.field}:${c.dir ?? 'asc'}`);
    } else if (c.kind === 'limit' && typeof c.n === 'number') {
      params.set('limit', String(c.n));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

async function readJson(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ---- One-shot CRUD ----------------------------------------------------------

export async function getDoc<T = DocumentData>(
  ref: DocumentReference<T>
): Promise<DocumentSnapshot<T>> {
  const res = await fetch(`/api/mongo/${encodeURIComponent(ref._col)}/${encodeURIComponent(ref._docId)}`, {
    cache: 'no-store',
  });
  const body = await readJson(res);
  if (!res.ok) {
    throw new FirestoreError(body?.error || `getDoc failed (${res.status})`, 'unavailable');
  }
  const data = body?.data ?? null;
  return {
    id: ref._docId,
    exists: () => !!data,
    data: () => (data ?? undefined) as T | undefined,
  };
}

export async function getDocs<T = DocumentData>(
  refOrQuery: CollectionReference<T> | Query<T>
): Promise<QuerySnapshot<T>> {
  const constraints = (refOrQuery as Query<T>)._constraints ?? [];
  const url = `/api/mongo/${encodeURIComponent(refOrQuery._col)}${constraintsToQueryString(constraints)}`;
  const res = await fetch(url, { cache: 'no-store' });
  const body = await readJson(res);
  if (!res.ok) {
    throw new FirestoreError(body?.error || `getDocs failed (${res.status})`, 'unavailable');
  }
  const items: any[] = body?.data ?? [];
  const docs = items.map((d: any) => {
    const id = d.id ?? '';
    const { id: _omit, ...rest } = d;
    return {
      id,
      exists: () => true,
      data: () => rest as T,
    };
  });
  return { docs, size: docs.length, empty: docs.length === 0 };
}

export async function setDoc<T = DocumentData>(
  ref: DocumentReference<T>,
  data: T,
  options?: SetOptions
): Promise<void> {
  const merge = options?.merge ? '?merge=true' : '';
  const res = await fetch(`/api/mongo/${encodeURIComponent(ref._col)}/${encodeURIComponent(ref._docId)}${merge}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data ?? {}),
  });
  if (!res.ok) {
    const body = await readJson(res);
    throw new FirestoreError(body?.error || `setDoc failed (${res.status})`, 'permission-denied');
  }
}

export async function updateDoc<T = DocumentData>(
  ref: DocumentReference<T>,
  data: Partial<T>
): Promise<void> {
  const res = await fetch(`/api/mongo/${encodeURIComponent(ref._col)}/${encodeURIComponent(ref._docId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data ?? {}),
  });
  if (!res.ok) {
    const body = await readJson(res);
    throw new FirestoreError(body?.error || `updateDoc failed (${res.status})`, 'permission-denied');
  }
}

export async function deleteDoc(ref: DocumentReference): Promise<void> {
  const res = await fetch(`/api/mongo/${encodeURIComponent(ref._col)}/${encodeURIComponent(ref._docId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const body = await readJson(res);
    throw new FirestoreError(body?.error || `deleteDoc failed (${res.status})`, 'permission-denied');
  }
}

export async function addDoc<T = DocumentData>(
  ref: CollectionReference<T>,
  data: T
): Promise<DocumentReference<T>> {
  const res = await fetch(`/api/mongo/${encodeURIComponent(ref._col)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data ?? {}),
  });
  const body = await readJson(res);
  if (!res.ok || !body?.id) {
    throw new FirestoreError(body?.error || `addDoc failed (${res.status})`, 'permission-denied');
  }
  return doc(null, ref._col, body.id) as DocumentReference<T>;
}

// ---- Internal helpers exported for hooks ----------------------------------

export const __mongoFetch = {
  getDocPath: (ref: DocumentReference) =>
    `/api/mongo/${encodeURIComponent(ref._col)}/${encodeURIComponent(ref._docId)}`,
  getCollectionPath: (refOrQuery: CollectionReference | Query) =>
    `/api/mongo/${encodeURIComponent(refOrQuery._col)}${constraintsToQueryString(
      (refOrQuery as Query)._constraints ?? []
    )}`,
};

// Stub for `onSnapshot` so legacy code that references it compiles.
// Hooks no longer use this; consumers should rely on `useDoc` / `useCollection`.
export function onSnapshot(): () => void {
  console.warn('[firestore-shim] onSnapshot is a no-op. Use useDoc/useCollection instead.');
  return () => {};
}
