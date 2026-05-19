import { MongoClient } from "mongodb";
import { getMongoConfig } from "@/lib/mongo-config";

/**
 * Singleton MongoDB connection. The connection details (URI + DB name) are
 * read from data/mongo-config.json (managed via the Configuration page) so
 * admins can update them at runtime without redeploying.
 */

interface MongoConnection {
  client: MongoClient;
  dbName: string;
}

declare global {
  // eslint-disable-next-line no-var
  var _mongoConnectionPromise: Promise<MongoConnection> | undefined;
}

/**
 * Returns a shared MongoClient connected to the configured MongoDB.
 * Pass `forceRefresh = true` to close the existing pool and reconnect with
 * the latest values from data/mongo-config.json.
 */
export async function getMongoDetails(forceRefresh = false): Promise<MongoConnection> {
    if (forceRefresh && global._mongoConnectionPromise) {
        const oldPromise = global._mongoConnectionPromise;
        global._mongoConnectionPromise = undefined;
        oldPromise
            .then(({ client }) => client.close().catch(() => {}))
            .catch(() => {});
    }

    if (global._mongoConnectionPromise) {
        return global._mongoConnectionPromise;
    }

    global._mongoConnectionPromise = (async () => {
        try {
            const { uri, dbName } = await getMongoConfig(forceRefresh);
            const client = new MongoClient(uri, {
                maxPoolSize: 50,
                minPoolSize: 2,
                maxIdleTimeMS: 60000,
                connectTimeoutMS: 100000,
                socketTimeoutMS: 120000,
            });

            await client.connect();
            return { client, dbName };
        } catch (error) {
            global._mongoConnectionPromise = undefined;
            throw error;
        }
    })();

    return global._mongoConnectionPromise;
}

/**
 * Explicitly resets the MongoDB connection pool. Call this after the URI or
 * DB name changes so subsequent `getMongoDetails()` calls reconnect.
 */
export async function resetMongoConnection() {
    if (global._mongoConnectionPromise) {
        const { client } = await global._mongoConnectionPromise;
        await client.close().catch(() => {});
        global._mongoConnectionPromise = undefined;
    }
}
