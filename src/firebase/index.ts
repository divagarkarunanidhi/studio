/**
 * Public surface of the legacy `@/firebase` module, now backed entirely by
 * MongoDB via the firestore-shim and `/api/mongo/*` REST endpoints.
 */

export * from './provider';
export * from './client-provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './non-blocking-updates';
export * from './errors';
export * from './error-emitter';

// Backwards-compat: some consumers (e.g. providers.tsx) called initializeFirebase.
// We keep a no-op so it stays importable but does nothing.
export function initializeFirebase() {
  return { firebaseApp: {}, auth: {}, firestore: {} };
}

export function getSdks() {
  return { firebaseApp: {}, auth: {}, firestore: {} };
}
