'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import type { Defect, Prediction } from '@/lib/types';
import { bulkPredictDefects } from '@/ai/flows/defect-prediction-flow';
import { chat } from '@/ai/flows/chatbot-flow';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Send, Bot, User } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface AIAssistantPageProps {
  defects: Defect[];
}

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export function AIAssistantPage({ defects }: AIAssistantPageProps) {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [isPredicting, setIsPredicting] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const { toast } = useToast();
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const getPredictions = async () => {
      if (defects.length === 0) {
        setIsPredicting(false);
        return;
      }

      setIsPredicting(true);
      try {
        const defectDataForPrediction = defects.map(({ id, summary, description }) => ({
          id,
          summary,
          description: description || summary,
        }));
        const result = await bulkPredictDefects({ defects: defectDataForPrediction });
        setPredictions(result.predictions);
      } catch (error) {
        console.error('Error fetching predictions:', error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Could not generate AI predictions.',
        });
      } finally {
        setIsPredicting(false);
      }
    };

    getPredictions();
  }, [defects, toast]);
  
  useEffect(() => {
    // Scroll to the bottom when new messages are added
    if (scrollAreaRef.current) {
        const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
        if (viewport) {
            viewport.scrollTop = viewport.scrollHeight;
        }
    }
  }, [messages]);


  const defectsById = useMemo(() => {
    return new Map(defects.map((defect) => [defect.id, defect]));
  }, [defects]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: input }];
    setMessages(newMessages);
    setInput('');
    setIsTyping(true);

    try {
      const response = await chat({
        history: newMessages.map(m => ({ role: m.role, content: m.content })),
        defects,
      });
      setMessages([...newMessages, { role: 'assistant', content: response }]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages([
        ...newMessages,
        { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="grid h-full grid-cols-1 gap-6 lg:grid-cols-2">
      <Card className="flex flex-col">
        <CardHeader>
          <CardTitle>AI Defect Predictions</CardTitle>
          <CardDescription>AI-powered analysis and predictions for each defect.</CardDescription>
        </CardHeader>
        <CardContent className="flex-grow overflow-hidden">
          <ScrollArea className="h-full">
            {isPredicting ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Summary</TableHead>
                    <TableHead>Predicted Severity</TableHead>
                    <TableHead>Predicted Priority</TableHead>
                    <TableHead>Prediction Summary</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {predictions.map((prediction) => {
                    const defect = defectsById.get(prediction.id);
                    return (
                      <TableRow key={prediction.id}>
                        <TableCell className="font-medium max-w-xs truncate">{defect?.summary || 'N/A'}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{prediction.predicted_severity}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{prediction.predicted_priority}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{prediction.prediction_summary}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="flex flex-col">
        <CardHeader>
          <CardTitle>AI Chat</CardTitle>
          <CardDescription>Ask questions or provide feedback about the defects.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col overflow-hidden">
          <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
            <div className="space-y-4">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex items-start gap-3 ${message.role === 'user' ? 'justify-end' : ''}`}
                >
                  {message.role === 'assistant' && <Bot className="size-6 text-primary shrink-0" />}
                  <div
                    className={`rounded-lg p-3 text-sm ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    <p>{message.content}</p>
                  </div>
                  {message.role === 'user' && <User className="size-6 text-muted-foreground shrink-0" />}
                </div>
              ))}
               {isTyping && (
                <div className="flex items-start gap-3">
                    <Bot className="size-6 text-primary shrink-0" />
                    <div className="rounded-lg bg-muted p-3 text-sm">
                        <div className="flex items-center gap-2">
                            <span className="h-2 w-2 animate-pulse rounded-full bg-foreground/50" style={{ animationDelay: '0s' }} />
                            <span className="h-2 w-2 animate-pulse rounded-full bg-foreground/50" style={{ animationDelay: '0.2s' }} />
                            <span className="h-2 w-2 animate-pulse rounded-full bg-foreground/50" style={{ animationDelay: '0.4s' }} />
                        </div>
                    </div>
                </div>
                )}
            </div>
          </ScrollArea>
          <div className="mt-4 border-t pt-4">
            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about defects or give feedback..."
                disabled={isTyping}
              />
              <Button type="submit" size="icon" disabled={isTyping}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
