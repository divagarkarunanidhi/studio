'use client';

import { useChat } from 'ai/react';
import { Send, ThumbsUp, ThumbsDown } from 'lucide-react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import type { Defect, DefectPrediction } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { FormEvent, useEffect, useRef } from 'react';

interface ChatbotProps {
  defects: Defect[];
  predictions: DefectPrediction[];
}

export function Chatbot({ defects, predictions }: ChatbotProps) {
  const { messages, input, handleInputChange, handleSubmit, isLoading, error } = useChat({
    api: '/api/chat',
    body: {
      defects,
      predictions,
    },
    initialMessages: [
      {
        id: 'initial-message',
        role: 'system',
        content: `You are an expert software quality assurance analyst. You are assisting a user by answering questions about a set of software defects and their predicted attributes.`,
      },
      {
        id: 'initial-ai-message',
        role: 'assistant',
        content: "Hello! I'm here to help. Ask me anything about the defects and their predictions.",
      }
    ],
  });

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (scrollAreaRef.current) {
        scrollAreaRef.current.scrollTo({
            top: scrollAreaRef.current.scrollHeight,
            behavior: 'smooth',
        });
    }
  }, [messages]);

  const handleFormSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if(input.trim()) {
        handleSubmit(e);
    }
  }


  return (
    <Card className="flex h-[70vh] flex-col">
      <CardHeader>
        <CardTitle>Defect Chatbot</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 overflow-hidden">
        <ScrollArea className="flex-1 pr-4" ref={scrollAreaRef}>
          <div className="space-y-4">
            {messages.filter(m => m.role !== 'system').map((m) => (
              <div
                key={m.id}
                className={cn(
                  'flex items-start gap-3',
                  m.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {m.role === 'assistant' && (
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>AI</AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={cn(
                    'max-w-xs rounded-lg px-4 py-2 text-sm lg:max-w-md',
                    m.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  )}
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  {m.role === 'assistant' && m.id !== 'initial-ai-message' && (
                    <div className="mt-2 flex items-center gap-2">
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                            <ThumbsUp className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                            <ThumbsDown className="h-4 w-4" />
                        </Button>
                    </div>
                  )}
                </div>
                {m.role === 'user' && (
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>U</AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))}
            {isLoading && (
                <div className="flex items-start gap-3 justify-start">
                    <Avatar className="h-8 w-8">
                        <AvatarFallback>AI</AvatarFallback>
                    </Avatar>
                    <div className="max-w-xs rounded-lg px-4 py-2 text-sm lg:max-w-md bg-muted">
                        <p>Thinking...</p>
                    </div>
                </div>
            )}
            {error && (
                <div className="flex items-start gap-3 justify-start">
                     <Avatar className="h-8 w-8">
                        <AvatarFallback>AI</AvatarFallback>
                    </Avatar>
                    <div className="max-w-xs rounded-lg px-4 py-2 text-sm lg:max-w-md bg-destructive/20 text-destructive-foreground">
                        <p>Sorry, I encountered an error. Please check the console for details.</p>
                    </div>
                </div>
            )}
          </div>
        </ScrollArea>
        <form onSubmit={handleFormSubmit} className="flex items-center gap-2 border-t pt-4">
          <Input
            value={input}
            onChange={handleInputChange}
            placeholder="Ask about defect trends..."
            className="flex-1"
            disabled={isLoading}
          />
          <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
