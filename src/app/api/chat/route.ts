import {NextRequest} from 'next/server';
import {Message, StreamingTextResponse} from 'ai';
import {chatWithDefects, ChatInputSchema} from '@/ai/flows/defect-chat-flow';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const json = await req.json();
  const { messages } = json;

  // The 'defects' are now part of the system message, so we don't need to parse them separately here.
  const result = ChatInputSchema.safeParse({ messages });
  if (!result.success) {
    return new Response(JSON.stringify(result.error), { status: 400 });
  }

  const stream = await chatWithDefects(result.data);

  return new StreamingTextResponse(stream);
}
