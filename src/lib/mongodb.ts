import { MongoClient } from "mongodb";
import { doc, getDoc } from 'firebase/firestore';
import { getFirestoreInstance } from "@/firebase/server-config";

/**
 * Robust Singleton Pattern for MongoDB in Next.js with Configuration Awareness.
 * Includes a refresh mechanism to handle updates to the connection string
 * from the administrative interface without requiring server restarts.
 */

interface MongoConnection {
  client: MongoClient;
  dbName: string;
}

// Extend the global object to store the promise and configuration metadata
declare global {
  // eslint-disable-next-line no-var
  var _mongoConnectionPromise: Promise<MongoConnection> | undefined;
  // eslint-disable-next-line no-var
  var _mongoConfigUsed: { uri: string; dbName: string } | undefined;
  // eslint-disable-next-line no-var
  var _lastMongoConfigCheck: number | undefined;
}

const CONFIG_CHECK_INTERVAL = 30000; // Check for config updates every 30 seconds

/**
 * Fetches MongoDB configuration from Firestore and returns a shared client singleton.
 * 
 * @param forceRefresh - If true, bypasses the internal timer and re-checks Firestore immediately.
 */
export async function getMongoDetails(forceRefresh = false): Promise<MongoConnection> {
    const now = Date.now();
    
    // 1. Check if we need to verify if the configuration has changed in Firestore
    const needsCheck = forceRefresh || !global._lastMongoConfigCheck || (now - global._lastMongoConfigCheck > CONFIG_CHECK_INTERVAL);

    if (needsCheck) {
        try {
            const { firestore } = await getFirestoreInstance();
            const configDocRef = doc(firestore, 'appConfiguration', 'global');
            const configSnap = await getDoc(configDocRef);

            if (configSnap.exists()) {
                const configData = configSnap.data();
                const currentUri = configData.mongodbUri;
                const currentDb = configData.mongodbDbName;

                // 2. If the URI or DB Name has changed compared to what the cached client is using,
                // we must invalidate the existing connection and close the old client.
                if (global._mongoConfigUsed && (global._mongoConfigUsed.uri !== currentUri || global._mongoConfigUsed.dbName !== currentDb)) {
                    console.log("MongoDB Configuration change detected. Invalidating existing connection pool...");
                    
                    if (global._mongoConnectionPromise) {
                        const oldPromise = global._mongoConnectionPromise;
                        global._mongoConnectionPromise = undefined;
                        
                        // Close the old client gracefully in the background
                        oldPromise.then(({ client }) => {
                            client.close().catch(err => console.error("Error closing old MongoDB client:", err));
                        }).catch(() => {});
                    }
                }
                
                // Update the check timestamp
                global._lastMongoConfigCheck = now;
            }
        } catch (error) {
            console.error("Failed to check for MongoDB configuration updates:", error);
            // On failure, we continue with the existing connection if we have one
        }
    }

    // 3. Return the existing connection promise if it's still valid
    if (global._mongoConnectionPromise) {
        return global._mongoConnectionPromise;
    }

    // 4. Initialize a new connection promise if one doesn't exist or was invalidated
    global._mongoConnectionPromise = (async () => {
        try {
            // Re-fetch configuration to ensure we have the absolute latest
            const { firestore } = await getFirestoreInstance();
            const configDocRef = doc(firestore, 'appConfiguration', 'global');
            const configSnap = await getDoc(configDocRef);

            if (!configSnap.exists()) {
                throw new Error("MongoDB configuration not found in Firestore.");
            }
            const configData = configSnap.data();
            const uri = configData.mongodbUri;
            const dbName = configData.mongodbDbName;

            if (!uri || !dbName) {
                throw new Error('Invalid or missing MongoDB configuration in Firestore.');
            }

            /**
             * Optimized MongoClient Configuration:
             * - maxPoolSize: Allows up to 50 concurrent connections for high traffic.
             * - minPoolSize: Keeps 2 connections "warm" to eliminate handshake latency.
             * - connectTimeoutMS: Large timeout for stability on slower networks.
             */
            const client = new MongoClient(uri, {
                tls: true,
                maxPoolSize: 50,
                minPoolSize: 2,
                maxIdleTimeMS: 60000,
                connectTimeoutMS: 100000,
                socketTimeoutMS: 120000,
            });

            // Establish the connection
            await client.connect();
            
            // Store configuration metadata for future change detection
            global._mongoConfigUsed = { uri, dbName };
            global._lastMongoConfigCheck = Date.now();
            
            return { client, dbName };
        } catch (error) {
            // If initialization fails, clear the global promise so the next request can try again.
            global._mongoConnectionPromise = undefined;
            throw error;
        }
    })();

    return global._mongoConnectionPromise;
}

/**
 * Explicitly resets the MongoDB connection pool.
 * Useful for debugging or manual re-syncing.
 */
export async function resetMongoConnection() {
    if (global._mongoConnectionPromise) {
        const { client } = await global._mongoConnectionPromise;
        await client.close().catch(() => {});
        global._mongoConnectionPromise = undefined;
        global._mongoConfigUsed = undefined;
        global._lastMongoConfigCheck = undefined;
    }
}
