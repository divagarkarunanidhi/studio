
"use client";

import React, { useState, useCallback } from 'react';
import { UploadCloud, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '../ui/button';

export function FileUploader({ onDataUploaded, templatePath = "/defects-template.csv", accept }: { onDataUploaded: (data: string, file: File) => void; templatePath?: string; accept?: string }) {
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();

  const handleFile = useCallback(async (file: File) => {
    // If an accept prop is provided, use it for validation
    if (accept) {
        const acceptedTypes = accept.split(',').map(t => t.trim());
        const fileType = file.type;
        const fileName = file.name;
        const isValid = acceptedTypes.some(type => {
            if (type.startsWith('.')) {
                return fileName.endsWith(type);
            }
            if (type.endsWith('/*')) {
                return fileType.startsWith(type.slice(0, -1));
            }
            return fileType === type;
        });

        if (!isValid) {
            toast({
                variant: 'destructive',
                title: 'Invalid file type',
                description: `Please upload a file of type: ${accept}`,
            });
            return;
        }
    }
    
    // Default CSV check if no accept prop
    else if (file && (file.type !== 'text/csv' && !file.name.endsWith('.csv'))) {
      toast({
        variant: 'destructive',
        title: 'Invalid file type',
        description: 'Please upload a valid .csv file.',
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
    try {
        const text = event.target?.result as string;
        onDataUploaded(text, file);
    } catch (error) {
        toast({
        variant: 'destructive',
        title: 'Error processing file',
        description: error instanceof Error ? error.message : 'An unknown error occurred.',
        });
    }
    };
    reader.readAsText(file, 'UTF-8');
    
  }, [onDataUploaded, toast, accept]);

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
    if (file) {
      handleFile(file);
    }
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
          {accept ? `${accept} file` : 'CSV file with data'}
        </p>
        <input
          id="file-upload"
          name="file-upload"
          type="file"
          className="sr-only"
          accept={accept || ".csv"}
          onChange={handleFileChange}
        />
      </label>
      {templatePath && (
        <div className="mt-4">
            <Button variant="outline" asChild>
            <a href={templatePath} download>
                <Download className="mr-2 h-4 w-4" />
                Download CSV Template
            </a>
            </Button>
        </div>
      )}
    </div>
  );
}
