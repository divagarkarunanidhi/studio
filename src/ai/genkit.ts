
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { getFirestoreInstance } from '@/firebase/server-config';


async function getGlobalConfig() {
    const { firestore } = await getFirestoreInstance();
    const configDocRef = doc(firestore, 'appConfiguration', 'global');
    const configSnap = await getDoc(configDocRef);

    if (!configSnap.exists()) {
        console.warn("App configuration not found in Firestore. AI features may not work.");
        return {
            apiKey: process.env.GEMINI_API_KEY,
            model: 'googleai/gemini-2.5-pro',
        };
    }
    const configData = configSnap.data();
    return {
        apiKey: configData.geminiApiKey,
        model: configData.geminiModel,
    };
}

const config = await getGlobalConfig();

export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: config.apiKey,
    }),
  ],
  model: config.model,
  disableTelemetry: true,
});
