'use client';

import { useChat, type Message } from 'ai/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Send, User, Bot, ThumbsUp, ThumbsDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Defect } from '@/lib/types';
import { useState } from 'react';

interface ChatbotProps {
  defects: Defect[];
}

export function Chatbot({ defects }: ChatbotProps) {
  const [feedback, setFeedback] = useState<{[id: string]: 'like' | 'dislike' | null}>({});

  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
    body: {
        defects,
    }
  });

  const handleFeedback = (id: string, newFeedback: 'like' | 'dislike') => {
    setFeedback(prev => ({
        ...prev,
        [id]: prev[id] === newFeedback ? null : newFeedback
    }));
  };

  return (
    <Card className="h-[600px] flex flex-col">
      <CardHeader>
        <CardTitle>Defect Chatbot</CardTitle>
      </CardHeader>
      <CardContent className="flex-grow flex flex-col gap-4 overflow-hidden">
        <ScrollArea className="flex-grow pr-4 -mr-4">
          <div className="space-y-4">
            {messages.map((m, index) => (
              <div
                key={index}
                className={cn(
                  'flex items-start gap-3',
                  m.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {m.role !== 'user' && (
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>
                      <Bot />
                    </AvatarFallback>
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
                   {m.role !== 'user' && m.id && (
                     <div className="mt-2 flex items-center gap-2">
                        <button onClick={() => handleFeedback(m.id, 'like')} className={cn("p-1 rounded-full hover:bg-muted-foreground/20", feedback[m.id] === 'like' && 'text-primary')}>
                            <ThumbsUp className="size-4" />
                        </button>
                         <button onClick={() => handleFeedback(m.id, 'dislike')} className={cn("p-1 rounded-full hover:bg-muted-foreground/20", feedback[m.id] === 'dislike' && 'text-destructive')}>
                            <ThumbsDown className="size-4" />
                        </button>
                    </div>
                   )}
                </div>
                {m.role === 'user' && (
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>
                      <User />
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex items-start gap-3 justify-start">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>
                    <Bot />
                  </AvatarFallback>
                </Avatar>
                <div className="max-w-xs rounded-lg bg-muted px-4 py-2 text-sm lg:max-w-md">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-foreground" />
                    <span className="h-2 w-2 animate-pulse rounded-full bg-foreground [animation-delay:0.2s]" />
                    <span className="h-2 w-2 animate-pulse rounded-full bg-foreground [animation-delay:0.4s]" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
        <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t pt-4">
          <Input
            value={input}
            onChange={handleInputChange}
            placeholder="Ask about these defects..."
            className="flex-grow"
            disabled={isLoading}
          />
          <Button type="submit" size="icon" disabled={isLoading || !input}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
