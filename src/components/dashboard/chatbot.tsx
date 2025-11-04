'use client';
import { useState, useRef, useEffect } from 'react';
import { CornerDownLeft, ThumbsUp, ThumbsDown, Bot, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { Defect } from '@/lib/types';
import { chatWithDefects } from '@/ai/flows/defect-chat-flow';
import { MessageData } from 'genkit';
import { Skeleton } from '../ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '../ui/alert';

interface ChatbotProps {
  defects: Defect[];
}

type Message = {
  id: string;
  role: 'user' | 'model';
  content: string;
  feedback?: 'good' | 'bad';
};

export function Chatbot({ defects }: ChatbotProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll to the bottom when messages change
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({
        top: scrollAreaRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const history: MessageData[] = messages.map((msg) => ({
        role: msg.role,
        content: [{ text: msg.content }],
      }));
      history.push({ role: 'user', content: [{ text: input }] });

      const response = await chatWithDefects({ defects, history });

      const modelMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: response,
      };
      setMessages((prev) => [...prev, modelMessage]);
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

  const handleFeedback = (id: string, feedback: 'good' | 'bad') => {
    setMessages((prev) =>
      prev.map((msg) => (msg.id === id ? { ...msg, feedback } : msg))
    );
    // Here you would typically send this feedback to a logging service or database
    console.log(`Feedback for message ${id}: ${feedback}`);
  };
  
  if (defects.length === 0) {
    return (
        <Alert className="h-full flex items-center justify-center">
            <div className="text-center">
                <Bot className="mx-auto h-12 w-12 text-muted-foreground" />
                <AlertTitle className="mt-4">Chatbot is ready</AlertTitle>
                <AlertDescription>
                    Upload a CSV file to start asking questions about your defects.
                </AlertDescription>
            </div>
        </Alert>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
        <div className="space-y-6">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'flex items-start gap-4',
                message.role === 'user' ? 'justify-end' : ''
              )}
            >
              {message.role === 'model' && (
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Bot size={20} />
                </div>
              )}
              <div
                className={cn(
                  'max-w-md rounded-lg p-3 text-sm',
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                )}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
                {message.role === 'model' && (
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      className={cn(
                        'h-6 w-6',
                        message.feedback === 'good' &&
                          'bg-emerald-100 text-emerald-600'
                      )}
                      onClick={() => handleFeedback(message.id, 'good')}
                    >
                      <ThumbsUp size={14} />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className={cn(
                        'h-6 w-6',
                        message.feedback === 'bad' &&
                          'bg-rose-100 text-rose-600'
                      )}
                      onClick={() => handleFeedback(message.id, 'bad')}
                    >
                      <ThumbsDown size={14} />
                    </Button>
                  </div>
                )}
              </div>
              {message.role === 'user' && (
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <User size={20} />
                </div>
              )}
            </div>
          ))}
          {isLoading && (
             <div className="flex items-start gap-4">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Bot size={20} />
                </div>
                <div className="max-w-md rounded-lg p-3 bg-muted w-full">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2 mt-2" />
                </div>
             </div>
          )}
        </div>
      </ScrollArea>
      <div className="relative mt-4">
        <Textarea
          placeholder="Ask a question about the defects..."
          className="pr-16"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSendMessage();
            }
          }}
        />
        <Button
          type="submit"
          size="icon"
          className="absolute right-2 top-1/2 -translate-y-1/2"
          onClick={handleSendMessage}
          disabled={isLoading || !input.trim()}
        >
          <CornerDownLeft size={16} />
        </Button>
      </div>
    </div>
  );
}
