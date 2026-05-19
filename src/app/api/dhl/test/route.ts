import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

async function withOptionalInsecureTls<T>(enabled: boolean | undefined, action: () => Promise<T>): Promise<T> {
  if (!enabled) {
    return action();
  }

  const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  try {
    return await action();
  } finally {
    if (previous === undefined) {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    } else {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous;
    }
  }
}

/**
 * POST /api/dhl/test
 * Validates DHL GenAI Gateway credentials by sending a minimal generation request.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { apiKey, endpoint, model, insecureTls } = body;

    console.log('[DHL Test] Request received:', {
      endpoint,
      model,
      insecureTls,
      apiKeyProvided: !!apiKey,
    });

    if (!apiKey || !endpoint || !model) {
      const res = { error: 'Configuration missing. Please provide API Key, Endpoint, and Model.' };
      console.log('[DHL Test] Response (400):', res);
      return NextResponse.json(res, { status: 400 });
    }

    const normalizedEndpoint = String(endpoint).trim().replace(/\/+$/, '');
    const normalizedModel = String(model).trim();

    console.log('[DHL Test] Sending request to:', `${normalizedEndpoint}/v1beta1/models/${normalizedModel}:generateContent`);
    const startTime = Date.now();

    const ai = new GoogleGenAI({
      vertexai: true,
      apiKey: String(apiKey),
      httpOptions: {
        baseUrl: normalizedEndpoint,
      },
    } as any);

    const response = await withOptionalInsecureTls(!!insecureTls, async () => {
      return ai.models.generateContent({
        model: normalizedModel,
        contents: 'Reply with the single word OK.',
      });
    });

    const elapsed = Date.now() - startTime;
    const text = response.text?.trim();

    console.log(`[DHL Test] Response received in ${elapsed}ms:`, {
      text,
      modelMetadata: response.modelVersion ?? null,
    });

    if (!text) {
      const res = { error: 'DHL test request succeeded but returned an empty response.' };
      console.log('[DHL Test] Response (502):', res);
      return NextResponse.json(res, { status: 502 });
    }

    const res = {
      success: true,
      message: `Successfully connected to DHL GenAI Gateway. Model ${normalizedModel} responded with: ${text}`,
      endpoint: normalizedEndpoint,
      model: normalizedModel,
    };
    console.log('[DHL Test] Response (200):', res);
    return NextResponse.json(res);
  } catch (e: any) {
    console.error('[DHL Test] Error:', e?.message || e);
    return NextResponse.json(
      {
        error: e?.message || 'An unexpected error occurred during the DHL test.',
      },
      { status: 500 }
    );
  }
}