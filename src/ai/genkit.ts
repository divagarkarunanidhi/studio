
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';
import openAI from 'genkitx-openai';
import { getGlobalAppConfig } from '@/lib/app-config';

type AiProvider = 'googleai' | 'dhl';

const DEFAULT_GOOGLEAI_MODEL = 'gemini-1.5-flash';
const DEFAULT_DHL_MODEL = 'gpt-4';


function stripPrefix(model: string, prefix: string): string {
    return model.replace(new RegExp(`^${prefix}/`, 'i'), '');
}

/** Resolve provider, primary model, and retry model from stored config. */
export async function getAiModelConfig() {
    const cfg = (await getGlobalAppConfig()) || {};
    const provider: AiProvider = cfg.aiProvider === 'dhl' ? 'dhl' : 'googleai';

    if (provider === 'dhl') {
        const primary = stripPrefix(cfg.dhlModel || DEFAULT_DHL_MODEL, 'openai');
        const retry = stripPrefix(cfg.dhlRetryModel || cfg.dhlModel || DEFAULT_DHL_MODEL, 'openai');
        return {
            provider,
            primaryModel: `openai/${primary}`,
            retryModel: `openai/${retry}`,
        };
    }

    const primary = stripPrefix(cfg.geminiModel || DEFAULT_GOOGLEAI_MODEL, 'googleai');
    const retry = stripPrefix(cfg.geminiRetryModel || cfg.geminiModel || DEFAULT_GOOGLEAI_MODEL, 'googleai');
    return {
        provider,
        primaryModel: `googleai/${primary}`,
        retryModel: `googleai/${retry}`,
    };
}

async function buildGenkitConfig() {
    const cfg = (await getGlobalAppConfig()) || {};
    const provider: AiProvider = cfg.aiProvider === 'dhl' ? 'dhl' : 'googleai';

    if (provider === 'dhl') {
        const apiKey = cfg.dhlApiKey ?? process.env.DHL_API_KEY;
        const baseURL = cfg.dhlEndpoint || process.env.DHL_ENDPOINT || '';
        const model = `openai/${stripPrefix(cfg.dhlModel || DEFAULT_DHL_MODEL, 'openai')}`;
        if (!apiKey) {
            console.warn('DHL API key missing. Set dhlApiKey in app config or DHL_API_KEY env var.');
        }
        if (!baseURL) {
            console.warn('DHL endpoint missing. Set dhlEndpoint in app config or DHL_ENDPOINT env var.');
        }
        return {
            plugins: [openAI({ apiKey: apiKey || 'missing', baseURL })],
            model,
        };
    }

    const apiKey = cfg.geminiApiKey ?? process.env.GEMINI_API_KEY;
    const model = `googleai/${stripPrefix(cfg.geminiModel || DEFAULT_GOOGLEAI_MODEL, 'googleai')}`;
    if (!apiKey) {
        console.warn('Gemini API key missing. Set geminiApiKey in app config or GEMINI_API_KEY env var.');
    }
    return {
        plugins: [googleAI({ apiKey })],
        model,
    };
}

const genkitConfig = await buildGenkitConfig();

export const ai = genkit({
    plugins: genkitConfig.plugins,
    model: genkitConfig.model,
    disableTelemetry: true,
});
