import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';

export const ai = genkit({
  plugins: [
    googleAI({
      // By default, Google does not use your data to train its models.
      // Your prompts and data are only used to generate a response for you.
      // For more details, see Google's AI privacy policy:
      // https://policies.google.com/privacy
    }),
  ],
  model: 'googleai/gemini-1.5-flash',
  // Telemetry data (traces, metrics) is stored in your own Google Cloud project
  // for observability and is not used by Google for any other purpose.
  // You can disable telemetry logging if you prefer.
  enableTelemetry: true,
});
