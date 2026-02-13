
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { firebaseConfig } from './config';

// A cache for the Firestore instance and config data
let firestoreInstance: Firestore | null = null;

async function initializeServerApp() {
    if (getApps().length === 0) {
        initializeApp(firebaseConfig);
    }
    return getApp();
}

/**
 * A server-safe function to get an initialized Firestore instance.
 * It ensures Firebase is initialized only once and performs an anonymous 
 * sign-in to satisfy Security Rules that require authentication.
 */
export async function getFirestoreInstance(): Promise<{ firestore: Firestore }> {
    if (firestoreInstance) {
        return { firestore: firestoreInstance };
    }

    const app = await initializeServerApp();
    const auth = getAuth(app);

    // CRITICAL: On the server, the Client SDK starts unauthenticated.
    // We sign in anonymously to satisfy 'isSignedIn()' security rules.
    if (!auth.currentUser) {
        try {
            await signInAnonymously(auth);
        } catch (e) {
            console.error("Firestore Server Config: Failed to authenticate server instance anonymously", e);
        }
    }

    const db = getFirestore(app);
    firestoreInstance = db;
    
    return { firestore: db };
}
