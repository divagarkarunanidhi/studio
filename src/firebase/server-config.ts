
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
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
 * It ensures Firebase is initialized only once.
 */
export async function getFirestoreInstance(): Promise<{ firestore: Firestore }> {
    if (firestoreInstance) {
        return { firestore: firestoreInstance };
    }

    const app = await initializeServerApp();
    const db = getFirestore(app);
    firestoreInstance = db;
    
    return { firestore: db };
}
