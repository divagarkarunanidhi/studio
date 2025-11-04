'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { DefectSchema } from '@/lib/types';
import { Message } from 'ai';

const ChatInputSchema = z.object({
  defects: z.array(DefectSchema),
  history: z.array(
    z.object({
      role: z.enum(['user', 'model']),
      content: z.string(),
    })
  ),
  prompt: z.string(),
});
export type ChatInput = z.infer<typeof ChatInputSchema>;

const ChatOutputSchema = z.object({
  response: z.string(),
});
export type ChatOutput = z.infer<typeof ChatOutputSchema>;

export async function chatWithDefects(
  defects: z.infer<typeof DefectSchema>[],
  history: Message[],
  prompt: string
): Promise<ChatOutput> {
  const defectsJson = JSON.stringify(defects, null, 2);

  const { output } = await ai.generate({
    model: 'googleai/gemini-2.5-flash',
    system: `You are a helpful QA assistant. You are an expert in software quality assurance.
The user has provided a list of defects in JSON format.
Your task is to answer the user's questions about these defects.
You can also provide insights and suggestions based on the defect data.
Defect Data:
${defectsJson}`,
    prompt,
    history,
  });

  if (!output || !output.text) {
    return {
      response: 'Sorry, I could not generate a response.',
    };
  }

  return {
    response: output.text,
  };
}
