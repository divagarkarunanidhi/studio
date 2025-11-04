
"use client";

import React, { useState, useCallback } from 'react';
import { UploadCloud, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Defect } from '@/lib/types';
import { Button } from '../ui/button';

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

// Function to parse flexible date formats
const parseDate = (dateString: string): Date | null => {
  if (!dateString) return null;
  // Try standard ISO and common formats first
  let date = new Date(dateString);
  if (!isNaN(date.getTime())) {
    return date;
  }
  // Try format "M/d/yyyy h:mm:ss a"
  const parts = dateString.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s+([AP]M)/);
  if (parts) {
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const year = parseInt(parts[3], 10);
    let hour = parseInt(parts[4], 10);
    const minute = parseInt(parts[5], 10);
    const second = parseInt(parts[6], 10);
    const ampm = parts[7];

    if (ampm === 'PM' && hour < 12) {
      hour += 12;
    }
    if (ampm === 'AM' && hour === 12) {
      hour = 0;
    }
    date = new Date(year, month, day, hour, minute, second);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  return null; // Return null if all parsing fails
}


export function FileUploader({ onDataUploaded }: { onDataUploaded: (data: Defect[]) => void; }) {
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

          const requiredHeaders = ['issue_key', 'summary', 'created'];
          for(const requiredHeader of requiredHeaders) {
            if(!headers.includes(requiredHeader)) {
              throw new Error(`CSV must include the following headers: ${requiredHeaders.join(', ')}. Missing: "${requiredHeader}"`);
            }
          }

          const data = rows.slice(1).map((row, rowIndex) => {
            let currentHeader = '';
            try {
                const values = parseCsvRow(row);
                if (values.length > headers.length) {
                    console.warn(`Row ${rowIndex + 2} has more columns than headers (expected ${headers.length}, got ${values.length}). Truncating row.`);
                    values.length = headers.length;
                } else if (values.length < headers.length) {
                    // Pad the values array if it's shorter than headers
                    while (values.length < headers.length) {
                        values.push('');
                    }
                }

                const defect: any = headers.reduce((obj, header, index) => {
                  currentHeader = header;
                  let value = values[index];
                  
                  // Handle date fields
                  if (header === 'created' || header === 'updated') {
                    const parsedDate = parseDate(value);
                    if (!parsedDate && header === 'created') { // 'created' is required
                        throw new Error(`Invalid or empty date in '${header}' column.`);
                    }
                    value = parsedDate ? parsedDate.toISOString() : '';
                  }

                  const key = header as keyof Defect | 'issue_key' | 'created' | 'reporter' | 'issue_type' | 'custom_field_business_domain' ;
                  // Map headers to the Defect type
                  if(key === 'issue_key') {
                      obj['id'] = value;
                  } else if(key === 'created') {
                      obj['created_at'] = value;
                  } else if (key === 'reporter') {
                      obj['reported_by'] = value;
                  } else if (key === 'custom_field_business_domain') {
                      obj['domain'] = value;
                  }
                  else {
                      obj[key] = value;
                  }
                  return obj;
                }, {} as any);

                // Ensure required fields are present
                if (!defect.id || !defect.summary || !defect.created_at) {
                  console.warn(`Row ${rowIndex + 2} is missing required data (id, summary, or created_at). Skipping row.`);
                  return null;
                }
                return defect;
            } catch (cellError: any) {
                // Throw a more specific error that will be caught by the main catch block
                throw new Error(`Error parsing row ${rowIndex + 2} at cell "${currentHeader}". Details: ${cellError.message}`);
            }
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

    