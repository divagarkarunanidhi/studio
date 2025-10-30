'use server';

/**
 * @fileoverview A chatbot flow that responds to user queries about defect data.
 *
 * - chat - A function that handles the chat interaction.
 * - ChatInput - The input type for the chat function.
 * - ChatOutput - The return type for the chat function.
 */
import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import {Defect} from '@/lib/types';

const ChatInputSchema = z.object({
  history: z.array(z.any()).describe('The chat history.'),
  message: z.string().describe('The user message.'),
  defects: z.array(z.any()).describe('A list of defect objects.'),
});
export type ChatInput = z.infer<typeof ChatInputSchema>;

const ChatOutputSchema = z.object({
  message: z.string().describe('The chatbot response.'),
});
export type ChatOutput = z.infer<typeof ChatOutputSchema>;

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
