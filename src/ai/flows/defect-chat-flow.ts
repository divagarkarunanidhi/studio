'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { DefectSchema } from '@/lib/types';
import { Message } from 'ai';

export const ChatInputSchema = z.object({
  defects: z.array(DefectSchema),
  messages: z.array(
    z.object({
      role: z.enum(['user', 'model', 'system', 'tool']),
      content: z.string(),
    })
  ),
});
export type ChatInput = z.infer<typeof ChatInputSchema>;


export async function chatWithDefects(
  input: ChatInput
) {
  const defectsJson = JSON.stringify(input.defects, null, 2);

  const history: Message[] = input.messages.map(m => ({ id: '', role: m.role, content: m.content }));
  const userPrompt = history.pop()?.content || '';

  const stream = await ai.generate({
    model: 'googleai/gemini-2.5-flash',
    system: `You are a helpful QA assistant. You are an expert in software quality assurance.
The user has provided a list of defects in JSON format.
Your task is to answer the user's questions about these defects.
You can also provide insights and suggestions based on the defect data.
Defect Data:
${defectsJson}`,
    prompt: userPrompt,
    history,
    stream: true,
  });

  return stream.textStream;
}
