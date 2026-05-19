'use client';

import React, { ReactNode } from 'react';
import { FirebaseProvider } from '@/firebase/provider';

interface FirebaseClientProviderProps {
  children: ReactNode;
}

/**
 * Pure wrapper over `FirebaseProvider` for backwards compatibility.
 * No Firebase SDK initialization happens; data goes through the Mongo-backed
 * shim under the hood.
 */
export function FirebaseClientProvider({ children }: FirebaseClientProviderProps) {
  return <FirebaseProvider>{children}</FirebaseProvider>;
}
