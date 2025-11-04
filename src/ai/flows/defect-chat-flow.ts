'use server';
/**
 * @fileOverview A conversational AI flow for discussing defect data.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { DefectSchema } from '@/lib/types';

const MessageSchema = z.object({
  role: z.enum(['user', 'model', 'system']),
  content: z.string(),
});

export const ChatInputSchema = z.object({
  messages: z.array(MessageSchema),
  defects: z.array(DefectSchema),
  predictions: z.array(z.any()), // Keeping predictions flexible for now
});

export type ChatInput = z.infer<typeof ChatInputSchema>;

export async function chatWithDefects(input: ChatInput) {
  const { messages, defects, predictions } = input;
  const systemMessage = `You are an expert software quality assurance analyst. You are assisting a user by answering questions about a set of software defects and their predicted attributes.
  Here is the defect data in JSON format:
  ${JSON.stringify(defects, null, 2)}
  
  Here are the AI-generated predictions for these defects:
  ${JSON.stringify(predictions, null, 2)}

  Answer the user's questions based on this data. Be concise and helpful.`;

  const history = messages.filter((m) => m.role !== 'system');
  const lastUserMessage = history.pop();

  if (!lastUserMessage || lastUserMessage.role !== 'user') {
    throw new Error('No user message found to process.');
  }

  const result = await ai.generate({
    system: systemMessage,
    history: history,
    prompt: lastUserMessage.content,
    config: {
      temperature: 0.3,
    }
  });

  return result.text;
}
