'use server';
/**
 * @fileOverview A chatbot flow for interacting with defect data.
 *
 * - chat - A function that handles the chat interaction.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { type ChatInput, type ChatOutput, ChatInputSchema } from '@/lib/types';

export async function chat(input: ChatInput): Promise<ChatOutput> {
  return chatFlow(input);
}

const prompt = ai.definePrompt({
  name: 'chatbotPrompt',
  input: { schema: ChatInputSchema },
  prompt: `You are a helpful AI assistant for a software development team.
Your role is to answer questions about a list of software defects.
You can also take feedback to help train the AI.

Here is the list of defects:
{{#each defects}}
- ID: {{id}}, Summary: {{summary}}, Status: {{status}}, Severity: {{severity}}, Priority: {{priority}}, Domain: {{domain}}, Reported by: {{reported_by}}, Created At: {{created_at}}
{{/each}}

Here is the conversation history:
{{#each history}}
{{role}}: {{content}}
{{/each}}

Based on the provided defects and conversation history, please provide a helpful and relevant response to the user's latest message. If the user is providing feedback, acknowledge it graciously.`,
});

const chatFlow = ai.defineFlow(
  {
    name: 'chatFlow',
    inputSchema: ChatInputSchema,
    outputSchema: z.string(),
  },
  async (input) => {
    const { output } = await prompt(input);
    return output || 'Sorry, I could not generate a response.';
  }
);