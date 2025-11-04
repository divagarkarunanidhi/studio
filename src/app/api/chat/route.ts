import { chatWithDefects } from '@/ai/flows/defect-chat-flow';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { messages, defects, predictions } = await req.json();
    
    // Call the Genkit flow
    const response = await chatWithDefects({ messages, defects, predictions });

    // Return the text response from the model
    return new Response(response, {
      headers: {
        'Content-Type': 'text/plain',
      },
    });

  } catch (error: any) {
    console.error('Error in chat API route:', error);
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}
