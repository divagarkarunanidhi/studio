'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { Message } from 'ai';

export const ChatInputSchema = z.object({
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

  const history = input.messages;
  const systemMessage = history.find(m => m.role === 'system')?.content || '';
  const userMessages = history.filter(m => m.role === 'user');
  const userPrompt = userMessages[userMessages.length - 1]?.content || '';
  
  const genkitHistory: Message[] = history.map(m => ({ id: '', role: m.role, content: m.content }));


  const stream = await ai.generate({
    model: 'googleai/gemini-2.5-flash',
    system: systemMessage,
    prompt: userPrompt,
    history: genkitHistory,
    stream: true,
  });

  return stream.textStream;
}
