
import { MongoClient } from "mongodb";
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';

const { firestore } = initializeFirebase();

let clientPromise: Promise<MongoClient>;
let dbName: string;

async function setupMongo() {
    const configDocRef = doc(firestore, 'appConfiguration', 'global');
    const configSnap = await getDoc(configDocRef);

    if (!configSnap.exists()) {
        throw new Error("MongoDB configuration not found in Firestore.");
    }
    const configData = configSnap.data();
    
    const uri = configData.mongodbUri;
    dbName = configData.mongodbDbName;

    if (!uri || !dbName) {
        throw new Error('Invalid/Missing MongoDB configuration in Firestore.');
    }

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
}

// We need an async function to export the promise, so we'll wrap the setup
// and export a promise that resolves with the clientPromise and dbName.
// This is a bit of a workaround to deal with the async setup.
// A better approach in a real app might be a dependency injection container.
let setupPromise: Promise<void> | null = null;
const getMongoDetails = () => {
    if (!setupPromise) {
        setupPromise = setupMongo();
    }
    return setupPromise.then(() => ({ clientPromise, dbName }));
}

export { getMongoDetails };
