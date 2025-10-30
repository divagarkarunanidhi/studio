'use server';

/**
 * @fileoverview A chatbot flow that responds to user queries about defect data.
 *
 * - chat - A function that handles the chat interaction.
 */
import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { ChatInputSchema, ChatOutputSchema, type ChatInput, type ChatOutput } from '@/lib/types';

export async function chat(input: ChatInput): Promise<ChatOutput> {
  return chatbotFlow(input);
}

const prompt = ai.definePrompt({
  name: 'chatbotPrompt',
  input: {schema: ChatInputSchema},
  output: {schema: ChatOutputSchema},
  prompt: `You are a helpful assistant for a software defect dashboard. 
Your goal is to answer questions based on the provided defect data. 
The user is providing you with a list of defects in JSON format.
Analyze the provided defect data to answer the user's question.

Defects:
{{{json defects}}}

Chat History:
{{#each history}}
- {{role}}: {{#each content}}{{#if text}}{{text}}{{/if}}{{#if media}}{{media url=media.url}}{{/if}}{{/each}}
{{/each}}

User Message:
{{{message}}}

Based on the data and history, provide a helpful response.
`,
});

const chatbotFlow = ai.defineFlow(
  {
    name: 'chatbotFlow',
    inputSchema: ChatInputSchema,
    outputSchema: ChatOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
