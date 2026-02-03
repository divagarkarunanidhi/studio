import { MongoClient } from "mongodb";
import { doc, getDoc } from 'firebase/firestore';
import { getFirestoreInstance } from "@/firebase/server-config";

// Global variables to store the cached connection and DB name
let cachedClient: MongoClient | null = null;
let cachedDbName: string | null = null;

/**
 * Fetches MongoDB configuration from Firestore, creates a shared client singleton,
 * and returns the client and database name.
 * 
 * By maintaining a singleton client, the application leverages MongoDB's internal
 * connection pooling and avoids the latency of new handshakes for every request.
 */
export async function getMongoDetails() {
    // If a connection is already established, return it immediately
    if (cachedClient && cachedDbName) {
        return { client: cachedClient, dbName: cachedDbName };
    }

    // Initialize Firebase and get Firestore instance
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

    // Create a new client with optimized pooling settings
    const client = new MongoClient(uri, {
        tls: true,
        maxPoolSize: 10,
        minPoolSize: 1,
    });

    // Establish the connection once
    await client.connect();
    
    // Cache the connected client and dbName for future requests
    cachedClient = client;
    cachedDbName = dbName;
    
    return { client, dbName };
}
