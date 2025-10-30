"use client";

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Send, Bot, User, Loader } from 'lucide-react';
import { chat } from '@/ai/flows/chatbot-flow';
import type { Defect } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

interface ChatbotPageProps {
  defects: Defect[];
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function ChatbotPage({ defects }: ChatbotPageProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({
        top: scrollAreaRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages]);
  
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
        const historyForApi = messages.map(msg => ({
            role: msg.role,
            content: [{ text: msg.content }],
        }));

      const response = await chat({ 
          history: historyForApi,
          message: input,
          defects: defects 
        });

      const assistantMessage: Message = { role: 'assistant', content: response.message };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
        console.error("Error calling chat flow:", error);
        toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to get a response from the AI. Please try again."
        });
        setMessages(prev => prev.slice(0, -1)); // Remove the user message on error
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <Card className="h-[calc(100vh-120px)] flex flex-col">
        <CardHeader>
            <CardTitle>AI Chatbot</CardTitle>
            <CardDescription>Ask questions about your defect data and get instant answers from our AI assistant.</CardDescription>
        </CardHeader>
      <CardContent className="flex-grow flex flex-col p-0">
        <ScrollArea className="flex-grow p-6" ref={scrollAreaRef}>
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div key={index} className={`flex items-start gap-3 ${message.role === 'user' ? 'justify-end' : ''}`}>
                {message.role === 'assistant' && (
                  <Avatar className="h-8 w-8">
                    <AvatarFallback><Bot size={20}/></AvatarFallback>
                  </Avatar>
                )}
                <div className={`rounded-lg p-3 max-w-sm ${message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                  <p className="text-sm">{message.content}</p>
                </div>
                {message.role === 'user' && (
                  <Avatar className="h-8 w-8">
                    <AvatarFallback><User size={20}/></AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex items-start gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback><Bot size={20}/></AvatarFallback>
                </Avatar>
                <div className="rounded-lg p-3 bg-muted">
                    <Loader className="animate-spin" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
        <div className="p-4 border-t">
          <form onSubmit={handleSendMessage} className="flex items-center gap-2">
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask about your defects..."
              disabled={isLoading}
            />
            <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
