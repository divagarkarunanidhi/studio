import { MongoClient } from "mongodb";
import { doc, getDoc } from 'firebase/firestore';
import { getFirestoreInstance } from "@/firebase/server-config";

/**
 * Robust Singleton Pattern for MongoDB in Next.js.
 * We use a global variable to persist the connection promise across hot reloads in development
 * and to prevent race conditions during initialization in production.
 */

interface MongoConnection {
  client: MongoClient;
  dbName: string;
}

// Extend the global object to store the promise
declare global {
  // eslint-disable-next-line no-var
  var _mongoConnectionPromise: Promise<MongoConnection> | undefined;
}

/**
 * Fetches MongoDB configuration from Firestore, creates a shared client singleton,
 * and returns the client and database name.
 * 
 * By maintaining a persistent connection pool via a global promise, the application 
 * eliminates TCP/SSL handshake latency for every request after the first one and 
 * prevents multiple connections from being opened during concurrent initial requests.
 */
export async function getMongoDetails(): Promise<MongoConnection> {
    // 1. Check if a connection promise already exists in the global scope.
    // This is the key optimization: concurrent requests will all wait for the same promise.
    if (global._mongoConnectionPromise) {
        return global._mongoConnectionPromise;
    }

    // 2. Initialize the connection promise if it doesn't exist.
    global._mongoConnectionPromise = (async () => {
        try {
            // Fetch configuration from Firestore (App Configuration)
            const { firestore } = await getFirestoreInstance();
            
            const configDocRef = doc(firestore, 'appConfiguration', 'global');
            const configSnap = await getDoc(configDocRef);

            if (!configSnap.exists()) {
                console.error("MongoDB configuration not found in Firestore.");
                throw new Error("MongoDB configuration not found in Firestore.");
            }
            const configData = configSnap.data();
            
            const uri = configData.mongodbUri;
            const dbName = configData.mongodbDbName;

            if (!uri || !dbName) {
                console.error('Invalid/Missing MongoDB configuration in Firestore.');
                throw new Error('Invalid/Missing MongoDB configuration in Firestore.');
            }

            /**
             * Optimized MongoClient Configuration:
             * - maxPoolSize: Allows up to 50 concurrent connections for high traffic.
             * - minPoolSize: Keeps 2 connections "warm" to eliminate handshake latency for most requests.
             * - maxIdleTimeMS: Closes connections that have been idle for 1 minute.
             * - connectTimeoutMS: Prevents the app from hanging if the database is unreachable.
             */
            const client = new MongoClient(uri, {
                tls: true,
                maxPoolSize: 50,
                minPoolSize: 2,
                maxIdleTimeMS: 60000,
                connectTimeoutMS: 10000,
                socketTimeoutMS: 45000,
            });

            // Establish the connection once
            await client.connect();
            
            return { client, dbName };
        } catch (error) {
            // If initialization fails, clear the global promise so the next request can try again.
            global._mongoConnectionPromise = undefined;
            throw error;
        }
    })();

    return global._mongoConnectionPromise;
}
