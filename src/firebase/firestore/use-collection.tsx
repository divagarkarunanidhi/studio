'use client';

import { useState, useEffect } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import {
  CollectionReference,
  Query,
  DocumentData,
  FirestoreError,
  __mongoFetch,
} from '@/firebase/firestore-shim';

export type WithId<T> = T & { id: string };

export interface UseCollectionResult<T> {
  data: WithId<T>[] | null;
  isLoading: boolean;
  error: FirestoreError | Error | null;
}

/**
 * Mongo-backed replacement for the legacy Firestore `useCollection` hook.
 * Performs a one-shot fetch on mount and whenever the (memoized) ref/query
 * changes.
 */
export function useCollection<T = any>(
  memoizedTargetRefOrQuery:
    | ((CollectionReference<DocumentData> | Query<DocumentData>) & { __memo?: boolean })
    | null
    | undefined,
): UseCollectionResult<T> {
  const [data, setData] = useState<WithId<T>[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<FirestoreError | Error | null>(null);

  useEffect(() => {
    if (!memoizedTargetRefOrQuery) {
      setData(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetch(__mongoFetch.getCollectionPath(memoizedTargetRefOrQuery), { cache: 'no-store' })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          const permErr = new FirestorePermissionError({
            operation: 'list',
            path: memoizedTargetRefOrQuery.path,
          });
          setError(permErr);
          setData(null);
          errorEmitter.emit('permission-error', permErr);
        } else {
          const items: any[] = body?.data ?? [];
          setData(
            items.map((d: any) => {
              const { id, ...rest } = d;
              return { ...(rest as T), id } as WithId<T>;
            })
          );
          setError(null);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setData(null);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [memoizedTargetRefOrQuery]);

  if (memoizedTargetRefOrQuery && !memoizedTargetRefOrQuery.__memo) {
    throw new Error(
      memoizedTargetRefOrQuery.path + ' was not properly memoized using useMemoFirebase'
    );
  }

  return { data, isLoading, error };
}
