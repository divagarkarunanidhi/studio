"use client";

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { predictDefect } from '@/ai/flows/defect-prediction-flow';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Wand2, Zap, BrainCircuit, Star, BarChart } from 'lucide-react';
import { Progress } from '../ui/progress';
import { Badge } from '../ui/badge';

const formSchema = z.object({
  summary: z.string().min(10, 'Summary must be at least 10 characters.'),
  description: z.string().min(20, 'Description must be at least 20 characters.'),
});

type Prediction = Awaited<ReturnType<typeof predictDefect>>;

export function PredictionPage() {
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      summary: '',
      description: '',
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    setPrediction(null);
    try {
      const result = await predictDefect(values);
      setPrediction(result);
    } catch (error) {
      console.error('Prediction failed:', error);
      toast({
        variant: 'destructive',
        title: 'Prediction Failed',
        description: 'The AI model could not make a prediction. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Predict Defect Properties</CardTitle>
          <CardDescription>Enter the details of a new defect, and the AI will predict its key properties.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="summary"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Summary</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., User login fails with invalid credentials" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Provide a detailed description of the issue, including steps to reproduce."
                        className="min-h-[150px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Analyzing...' : 'Predict'}
                <Wand2 className="ml-2" />
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Prediction Results</CardTitle>
            <CardDescription>The AI's analysis of the defect will appear here.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && (
                <div className="flex items-center justify-center p-8">
                    <Zap className="h-8 w-8 animate-pulse text-primary" />
                    <p className="ml-4 text-muted-foreground">AI is thinking...</p>
                </div>
            )}
            {prediction && !isLoading && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <BarChart/>
                        <span>Confidence Score</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Progress value={prediction.confidence_score * 100} className="w-24"/>
                        <span className="font-bold text-lg">{(prediction.confidence_score * 100).toFixed(0)}%</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="flex flex-col items-center justify-center rounded-lg border p-4">
                    <Star className="h-6 w-6 text-yellow-500 mb-2" />
                    <p className="text-sm text-muted-foreground">Severity</p>
                    <Badge variant="destructive" className="text-base">{prediction.predicted_severity}</Badge>
                  </div>
                  <div className="flex flex-col items-center justify-center rounded-lg border p-4">
                    <Zap className="h-6 w-6 text-blue-500 mb-2" />
                    <p className="text-sm text-muted-foreground">Priority</p>
                    <Badge variant="secondary" className="text-base">{prediction.predicted_priority}</Badge>
                  </div>
                  <div className="flex flex-col items-center justify-center rounded-lg border p-4">
                    <BrainCircuit className="h-6 w-6 text-green-500 mb-2" />
                    <p className="text-sm text-muted-foreground">Domain</p>
                    <Badge variant="outline" className="text-base">{prediction.suggested_domain}</Badge>
                  </div>
                </div>
              </div>
            )}
            {!prediction && !isLoading && (
                <div className="flex flex-col items-center justify-center p-8 text-center">
                    <Wand2 className="h-10 w-10 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground">Your prediction results will be shown here.</p>
                </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
