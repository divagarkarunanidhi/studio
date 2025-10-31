"use client";

import React, { useState, useCallback } from 'react';
import { UploadCloud } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Defect } from '@/lib/types';

interface FileUploaderProps {
  onDataUploaded: (data: Defect[]) => void;
}

const parseCsvRow = (row: string): string[] => {
  const result: string[] = [];
  let currentField = '';
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    if (char === '"') {
      if (inQuotes && i + 1 < row.length && row[i + 1] === '"') {
        currentField += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(currentField.trim());
      currentField = '';
    } else {
      currentField += char;
    }
  }
  result.push(currentField.trim());
  return result;
};


export function FileUploader({ onDataUploaded }: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();

  const handleFile = useCallback((file: File) => {
    if (file && file.type === 'text/csv') {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const text = event.target?.result as string;
          const rows = text.split(/\r?\n/).filter(row => row.trim() !== '');
          if (rows.length < 2) {
            throw new Error('CSV file must have a header and at least one data row.');
          }
          
          const headers = parseCsvRow(rows[0]).map(h => h.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, ''));

          const requiredHeaders = ['issue_id', 'summary', 'created'];
          for(const requiredHeader of requiredHeaders) {
            if(!headers.includes(requiredHeader)) {
              throw new Error(`CSV must include the following headers: ${requiredHeaders.join(', ')}. Missing: ${requiredHeader}`);
            }
          }

          const data = rows.slice(1).map((row, rowIndex) => {
            const values = parseCsvRow(row);
            if (values.length !== headers.length) {
                console.warn(`Row ${rowIndex + 2} has an incorrect number of columns (expected ${headers.length}, got ${values.length}). Skipping row.`);
                return null;
            }
             const defect: any = headers.reduce((obj, header, index) => {
              const key = header as keyof Defect;
              // Map headers to the Defect type
              if(key === 'issue_id') {
                obj['id'] = values[index];
              } else if(key === 'created') {
                obj['created_at'] = values[index];
              } else if (key === 'reporter') {
                obj['reported_by'] = values[index];
              }
              else {
                obj[key] = values[index];
              }
              return obj;
            }, {} as any);

            // Ensure required fields are present
            if (!defect.id || !defect.summary || !defect.created_at) {
              console.warn(`Row ${rowIndex + 2} is missing required data (id, summary, or created_at). Skipping row.`);
              return null;
            }
            return defect;
          }).filter((d): d is Defect => d !== null);
          
          if(data.length === 0) {
            throw new Error('No valid defect data could be parsed from the file. Please check the console for warnings about skipped rows.');
          }

          onDataUploaded(data as Defect[]);
          toast({
            title: 'Success!',
            description: `${data.length} records loaded from ${file.name}.`,
          });
        } catch (error) {
          toast({
            variant: 'destructive',
            title: 'Error parsing file',
            description: error instanceof Error ? error.message : 'An unknown error occurred.',
          });
        }
      };
      reader.readAsText(file);
    } else {
      toast({
        variant: 'destructive',
        title: 'Invalid file type',
        description: 'Please upload a valid .csv file.',
      });
    }
  }, [onDataUploaded, toast]);

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
    <div className="w-full max-w-lg">
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
    </div>
  );
}
