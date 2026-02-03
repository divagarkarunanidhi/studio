
import { MongoClient } from "mongodb";
import { doc, getDoc } from 'firebase/firestore';
import { getFirestoreInstance } from "@/firebase/server-config";

/**
 * Fetches MongoDB configuration from Firestore, creates a new client, 
 * connects to the database, and returns the client and database name.
 * 
 * IMPORTANT: The caller is responsible for calling client.close() 
 * immediately after usage to ensure connections are not leaked.
 */
export async function getMongoDetails() {
    // Initialize Firebase and get Firestore instance inside the function.
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
        console.error('Invalid/Missing MongoDB configuration in Firestore.', { uri: !!uri, dbName: !!localDbName });
        throw new Error('Invalid/Missing MongoDB configuration in Firestore.');
    }

    const client = new MongoClient(uri, {
        tls: true,
    });

    // Establish the connection
    await client.connect();
    
    return { client, dbName };
}
