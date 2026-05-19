/**
 * Server-side helpers for reading the global app configuration document and
 * shared feedback examples from MongoDB. Replaces the previous Firestore
 * lookups in the AI flows and the genkit bootstrap.
 */
import { getMongoDetails } from '@/lib/mongodb';

const COLLECTION = 'appConfiguration';
const DOC_ID = 'global';

export async function getGlobalAppConfig(): Promise<Record<string, any> | null> {
  try {
    const { client, dbName } = await getMongoDetails();
    const db = client.db(dbName);
    const doc = await db.collection(COLLECTION).findOne({ _id: DOC_ID as any });
    if (!doc) return null;
    const { _id, ...config } = doc as any;
    return config;
  } catch (err) {
    console.error('[getGlobalAppConfig] Mongo read failed:', err);
    return null;
  }
}

export async function getSharedFeedbackExamples(maxItems = 15): Promise<Array<Record<string, any>>> {
  try {
    const { client, dbName } = await getMongoDetails();
    const db = client.db(dbName);
    const docs = await db
      .collection('sharedFeedback')
      .find({})
      .sort({ savedAt: -1 })
      .limit(maxItems)
      .toArray();
    return docs.map((d: any) => {
      const { _id, ...rest } = d;
      return { id: typeof _id === 'string' ? _id : _id?.toString(), ...rest };
    });
  } catch (err) {
    console.error('[getSharedFeedbackExamples] Mongo read failed:', err);
    return [];
  }
}

