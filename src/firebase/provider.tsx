'use client';

import React, { DependencyList, createContext, useContext, ReactNode, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';

/**
 * Lightweight stand-ins kept under the original names so existing consumers
 * keep compiling. The Firebase SDK is no longer used; data flows through the
 * Mongo-backed shim in `firestore-shim.ts` and the `/api/mongo/*` endpoints.
 */
type FirebaseApp = Record<string, never>;
type Firestore = Record<string, never>;
type Auth = Record<string, never>;

interface FirebaseProviderProps {
  children: ReactNode;
}

export interface FirebaseContextState {
  areServicesAvailable: boolean;
  firebaseApp: FirebaseApp | null;
  firestore: Firestore | null;
  auth: Auth | null;
}

export interface FirebaseServices {
  firebaseApp: FirebaseApp;
  firestore: Firestore;
  auth: Auth;
}

export interface SessionUser {
  uid: string;
  email?: string | null;
  name?: string | null;
  username?: string;
  role?: 'admin' | 'taas' | 'view' | 'newuser';
}

export interface UserHookResult {
  user: SessionUser | null;
  isUserLoading: boolean;
  userError: Error | null;
}

const STUB_SERVICES: FirebaseServices = {
  firebaseApp: {} as FirebaseApp,
  firestore: {} as Firestore,
  auth: {} as Auth,
};

export const FirebaseContext = createContext<FirebaseContextState | undefined>(undefined);

export const FirebaseProvider: React.FC<FirebaseProviderProps> = ({ children }) => {
  const contextValue = useMemo<FirebaseContextState>(
    () => ({
      areServicesAvailable: true,
      firebaseApp: STUB_SERVICES.firebaseApp,
      firestore: STUB_SERVICES.firestore,
      auth: STUB_SERVICES.auth,
    }),
    []
  );

  return (
    <FirebaseContext.Provider value={contextValue}>
      <FirebaseErrorListener />
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = (): FirebaseServices => {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error('useFirebase must be used within a FirebaseProvider.');
  }
  return STUB_SERVICES;
};

export const useAuth = (): Auth => STUB_SERVICES.auth;
export const useFirestore = (): Firestore => STUB_SERVICES.firestore;
export const useFirebaseApp = (): FirebaseApp => STUB_SERVICES.firebaseApp;

type MemoFirebase<T> = T & { __memo?: boolean };

export function useMemoFirebase<T>(factory: () => T, deps: DependencyList): T | MemoFirebase<T> {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memoized = useMemo(factory, deps);
  if (typeof memoized !== 'object' || memoized === null) return memoized;
  (memoized as MemoFirebase<T>).__memo = true;
  return memoized;
}

export const useUser = (): UserHookResult => {
  const { data: session, status } = useSession();
  const sessionUser = session?.user as SessionUser | undefined;

  return {
    user: sessionUser ?? null,
    isUserLoading: status === 'loading',
    userError: null,
  };
};
