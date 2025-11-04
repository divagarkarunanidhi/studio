'use client';

import { useState } from 'react';
import { useChat, type Message } from 'ai/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Send, User, Bot, ThumbsUp, ThumbsDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Defect } from '@/lib/types';
import { chatWithDefects } from '@/ai/flows/defect-chat-flow';

interface ChatbotProps {
  defects: Defect[];
}

export function Chatbot({ defects }: ChatbotProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{[id: string]: 'like' | 'dislike' | null}>({});

  const handleFeedback = (id: string, newFeedback: 'like' | 'dislike') => {
    setFeedback(prev => ({
        ...prev,
        [id]: prev[id] === newFeedback ? null : newFeedback
    }));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
        const chatHistory = messages.filter(m => m.role !== 'user' || m.content !== input);
        const { response } = await chatWithDefects(defects, chatHistory, input);

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: response,
      };
      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error('Error fetching chat response:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: 'Sorry, I encountered an error. Please try again.',
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
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
                {m.role === 'model' && (
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
                   {m.role === 'model' && (
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
          <Button type="submit" size="icon" disabled={isLoading}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
