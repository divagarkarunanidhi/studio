# DHL GenAI Gateway Setup Guide

This guide explains how to configure the application to use **DHL GenAI Gateway** for AI-powered defect predictions and analysis.

## Prerequisites

You should have received DHL GenAI Gateway credentials:
- **API Key:** Your authentication token
- **Endpoint:** The API endpoint URL (e.g., `https://apihub-sandbox.dhl.com/genai-test`)

## Configuration Methods

### Method 1: Web UI Configuration (Recommended)

1. Start the application: `npm run dev`
2. Navigate to **Settings** → **Configuration**
3. Under **AI Provider**, select **DHL GenAI Gateway**
4. Fill in the following fields:
   - **DHL API Key:** Paste your API key
   - **DHL Endpoint:** Enter your endpoint URL (defaults to sandbox)
   - **Primary Model:** Model name (default: `gpt-4`)
   - **Retry Model:** Fallback model for rate-limit scenarios (default: `gpt-4`)
5. Click **Save** to persist the configuration to MongoDB

### Method 2: Environment Variables

Set these environment variables before starting the application:

```bash
export DHL_API_KEY="bd92a756e99f3906e095d006c27fdfdbcf60ab4f6b1883411b81ebbd4badcb42"
export DHL_ENDPOINT="https://apihub-sandbox.dhl.com/genai-test"
```

Then set `aiProvider` to `dhl` in the configuration UI or MongoDB.

### Method 3: Direct MongoDB Update (Advanced)

Update the `appConfiguration` collection in MongoDB:

```json
{
  "_id": "global",
  "aiProvider": "dhl",
  "dhlApiKey": "bd92a756e99f3906e095d006c27fdfdbcf60ab4f6b1883411b81ebbd4badcb42",
  "dhlEndpoint": "https://apihub-sandbox.dhl.com/genai-test",
  "dhlModel": "gpt-4",
  "dhlRetryModel": "gpt-4"
}
```

## How It Works

1. **Configuration Loaded:** On startup, the Genkit initialization reads the active AI provider from MongoDB
2. **Model Selection:** Based on the `aiProvider` setting, appropriate OpenAI-compatible credentials are loaded
3. **API Calls:** Defect predictions and analysis flows use the DHL endpoint with your API key
4. **Fallback Handling:** If the primary model returns rate-limit errors (429/503), it automatically retries with the retry model

## Switching Between Providers

To switch from DHL back to another provider:

1. Go to **Settings** → **Configuration**
2. Change **AI Provider** to `Google Gemini` or `GitHub Models`
3. Provide credentials for the new provider
4. Save and restart the dev server: `npm run dev`

## Supported Models

DHL GenAI Gateway supports OpenAI-compatible models. Common options:
- `gpt-4` (recommended)
- `gpt-3.5-turbo` (faster, cost-effective)
- Other models available through your DHL subscription

## Troubleshooting

### "DHL API key missing" Warning
- **Cause:** The API key is not configured
- **Solution:** Set it via the Configuration UI or `DHL_API_KEY` environment variable

### Connection Errors to DHL Endpoint
- **Cause:** Invalid endpoint URL or API key
- **Solution:** Verify the endpoint URL and API key match your DHL credentials

### Rate Limiting (429 Errors)
- **Cause:** Too many requests to DHL
- **Solution:** The system will automatically retry with the retry model. Ensure it's configured

## More Information

For additional documentation on DHL GenAI Gateway, visit:
https://ai.its.dhl.com/

For support, contact:
GenAI Gateway Support (GenAI-Gateway@dhl.com)
