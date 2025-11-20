
import { MongoClient } from "mongodb";
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { getFirestoreInstance } from "@/firebase/server-config";

let clientPromise: Promise<MongoClient> | undefined;
let dbName: string | undefined;

// This function will be called by API routes to ensure everything is initialized.
async function setupMongo() {
    // Only initialize if we haven't already.
    if (clientPromise && dbName) {
        return { clientPromise, dbName };
    }

    // Initialize Firebase and get Firestore instance *inside* the setup function.
    const { firestore } = await getFirestoreInstance();
    
    const configDocRef = doc(firestore, 'appConfiguration', 'global');
    const configSnap = await getDoc(configDocRef);

    if (!configSnap.exists()) {
        console.error("MongoDB configuration not found in Firestore.");
        throw new Error("MongoDB configuration not found in Firestore.");
    }
    const configData = configSnap.data();
    
    const uri = configData.mongodbUri;
    const localDbName = configData.mongodbDbName;

    if (!uri || !localDbName) {
        console.error('Invalid/Missing MongoDB configuration in Firestore.', { uri: !!uri, dbName: !!localDbName });
        throw new Error('Invalid/Missing MongoDB configuration in Firestore.');
    }
    
    dbName = localDbName;

    const options = {
        tls: true,
    };

    let client: MongoClient;
    
    if (process.env.NODE_ENV === "development") {
        let globalWithMongo = global as typeof globalThis & {
            _mongoClientPromise?: Promise<MongoClient>;
        };

        if (!globalWithMongo._mongoClientPromise) {
            client = new MongoClient(uri, options);
            globalWithMongo._mongoClientPromise = client.connect();
        }
        clientPromise = globalWithMongo._mongoClientPromise;
    } else {
        client = new MongoClient(uri, options);
        clientPromise = client.connect();
    }
    
    return { clientPromise, dbName };
}

// getMongoDetails now ensures setup is complete before returning.
const getMongoDetails = async () => {
    return await setupMongo();
}

export { getMongoDetails };
