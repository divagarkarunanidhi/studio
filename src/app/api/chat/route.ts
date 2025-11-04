import {NextRequest} from 'next/server';
import {Message, StreamingTextResponse} from 'ai';
import {chatWithDefects, ChatInputSchema} from '@/ai/flows/defect-chat-flow';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const json = await req.json();
  const { messages, defects } = json;

  const result = ChatInputSchema.safeParse({ defects, messages });
  if (!result.success) {
    return new Response(JSON.stringify(result.error), { status: 400 });
  }

  const stream = await chatWithDefects(result.data);

  return new StreamingTextResponse(stream);
}
