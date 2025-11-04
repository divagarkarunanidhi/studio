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
  
  // The system message provides context to the model.
  const systemMessage = history.find(m => m.role === 'system')?.content || '';
  
  // The user prompt is the last message from the user.
  const userMessages = history.filter(m => m.role === 'user');
  const userPrompt = userMessages[userMessages.length - 1]?.content || '';
  
  // The Genkit history should include everything *except* the latest user prompt.
  const genkitHistory: Message[] = history.slice(0, -1).map(m => ({ id: '', role: m.role, content: m.content }));


  const stream = await ai.generate({
    // The model is now set globally, but can be overridden here.
    system: systemMessage,
    prompt: userPrompt,
    history: genkitHistory,
    stream: true,
  });

  return stream.textStream;
}
