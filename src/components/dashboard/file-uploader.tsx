
"use client";

import React, { useState, useCallback } from 'react';
import { UploadCloud, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '../ui/button';
import { uploadDefects } from '@/app/actions';
import { useRouter } from 'next/navigation';


export function FileUploader({ onDataUploaded }: { onDataUploaded: (data: { count: number; timestamp?: string }) => void; }) {
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const handleFile = useCallback(async (file: File) => {
    if (file && file.type === 'text/csv') {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const text = event.target?.result as string;
          
          const result = await uploadDefects(text);

          if (result.success) {
            toast({
              title: 'Success!',
              description: `${result.count} records loaded from ${file.name}.`,
            });
            onDataUploaded({count: result.count, timestamp: result.timestamp});
            router.refresh(); // Refresh the page to show the new data
          } else {
            throw new Error(result.error);
          }
        } catch (error) {
          toast({
            variant: 'destructive',
            title: 'Error processing file',
            description: error instanceof Error ? error.message : 'An unknown error occurred.',
          });
        }
      };
      reader.readAsText(file, 'UTF-8');
    } else {
      toast({
        variant: 'destructive',
        title: 'Invalid file type',
        description: 'Please upload a valid .csv file.',
      });
    }
  }, [onDataUploaded, toast, router]);

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  return (
    <div className="w-full max-w-lg text-center">
      <label
        htmlFor="file-upload"
        className={`relative flex w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-12 text-center cursor-pointer transition-colors ${
          isDragging ? 'border-primary bg-primary/10' : 'bg-card hover:border-primary/50'
        }`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <UploadCloud className="mx-auto h-12 w-12 text-muted-foreground" />
        <p className="mt-4 font-semibold text-foreground">
          Click to upload or drag and drop
        </p>
        <p className="text-sm text-muted-foreground">
          CSV file with defect data
        </p>
        <input
          id="file-upload"
          name="file-upload"
          type="file"
          className="sr-only"
          accept=".csv"
          onChange={handleFileChange}
        />
      </label>
      <div className="mt-4">
        <Button variant="outline" asChild>
          <a href="/defects-template.csv" download>
            <Download className="mr-2 h-4 w-4" />
            Download CSV Template
          </a>
        </Button>
      </div>
    </div>
  );
}
