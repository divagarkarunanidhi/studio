'use client';

import { useState, useEffect } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import {
  DocumentReference,
  DocumentData,
  FirestoreError,
  __mongoFetch,
} from '@/firebase/firestore-shim';

type WithId<T> = T & { id: string };

export interface UseDocResult<T> {
  data: WithId<T> | null;
  isLoading: boolean;
  error: FirestoreError | Error | null;
}

/**
 * Mongo-backed replacement for the legacy Firestore `useDoc` hook.
 * Performs a one-shot fetch on mount and whenever the (memoized) ref changes.
 */
export function useDoc<T = any>(
  memoizedDocRef: (DocumentReference<DocumentData> & { __memo?: boolean }) | null | undefined,
): UseDocResult<T> {
  const [data, setData] = useState<WithId<T> | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<FirestoreError | Error | null>(null);

  useEffect(() => {
    if (!memoizedDocRef) {
      setData(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetch(__mongoFetch.getDocPath(memoizedDocRef), { cache: 'no-store' })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          const permErr = new FirestorePermissionError({
            operation: 'get',
            path: memoizedDocRef.path,
          });
          setError(permErr);
          setData(null);
          errorEmitter.emit('permission-error', permErr);
        } else if (body?.data) {
          const { id, ...rest } = body.data;
          setData({ ...(rest as T), id: id ?? memoizedDocRef.id });
          setError(null);
        } else {
          setData(null);
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
  }, [memoizedDocRef]);

  if (memoizedDocRef && !memoizedDocRef.__memo) {
    throw new Error(memoizedDocRef.path + ' was not properly memoized using useMemoFirebase');
  }

  return { data, isLoading, error };
}
