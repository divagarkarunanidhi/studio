'use server';
/**
 * @fileOverview A conversational AI flow for chatting about defect data.
 *
 * - chatWithDefects - A function that takes a user query and conversation history
 *   to generate a response about the provided defects.
 */
import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { DefectSchema } from '@/lib/types';
import { MessageData } from 'genkit';

const ChatInputSchema = z.object({
  defects: z.array(DefectSchema),
  history: z.array(z.custom<MessageData>()),
});
export type ChatInput = z.infer<typeof ChatInputSchema>;

const ChatOutputSchema = z.string();
export type ChatOutput = z.infer<typeof ChatOutputSchema>;

export async function chatWithDefects(input: ChatInput): Promise<ChatOutput> {
  const { defects, history } = input;
  const defectsJson = JSON.stringify(defects, null, 2);

  const model = ai.getModel('googleai/gemini-2.5-flash');

  const { output } = await ai.generate({
    model,
    history,
    prompt: `You are an expert software quality assurance analyst.
    Your task is to answer questions based on a provided list of defects in JSON format.
    Use ONLY the data provided in the JSON to answer the user's questions. Do not make up information.
    If the answer cannot be found in the provided data, say "I cannot answer that based on the provided data."

    Here is the defect data:
    ${defectsJson}
    `,
    config: {
      temperature: 0.1,
    },
  });

  return output?.text || 'Sorry, I could not generate a response.';
}
