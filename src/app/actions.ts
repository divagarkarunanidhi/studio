'use server';

import {promises as fs} from 'fs';
import path from 'path';
import os from 'os';
import type {Defect} from '@/lib/types';
import {DefectSchema} from '@/lib/types';

// Use a consistent file path in the temporary directory
const defectsFilePath = path.join(os.tmpdir(), 'defects.json');

const parseCSV = (text: string): string[][] => {
  const result: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          currentField += '"';
          i++; // Skip the second quote
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
      } else if (char === '\n' || char === '\r') {
        currentRow.push(currentField);
        result.push(currentRow);
        currentRow = [];
        currentField = '';
        if (char === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
          i++;
        }
      } else {
        currentField += char;
      }
    }
    i++;
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    result.push(currentRow);
  }

  return result.filter(
    (row) => row.length > 1 || (row.length === 1 && row[0].trim() !== '')
  );
};

const parseDate = (dateString: string): Date | null => {
    if (!dateString) return null;
    let date = new Date(dateString);
    if (!isNaN(date.getTime())) {
      return date;
    }
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
  
    return null;
  }

/**
 * Parses raw CSV text, converts it to Defect objects, and saves it to a server-side file.
 * @param csvText The raw CSV string content.
 * @returns An object indicating success, the number of records, and an optional error message.
 */
export async function uploadDefects(
  csvText: string
): Promise<{success: boolean; count: number; error?: string; timestamp?: string}> {
  try {
    const rows = parseCSV(csvText);
    if (rows.length < 2) {
      throw new Error('CSV file must have a header and at least one data row.');
    }

    let headers = rows[0].map((h) =>
      h.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')
    );

    const requiredHeaders = ['issue_key', 'summary', 'created'];
    for (const requiredHeader of requiredHeaders) {
      if (!headers.includes(requiredHeader)) {
        throw new Error(
          `CSV must include the following headers: ${requiredHeaders.join(
            ', '
          )}. Missing: "${requiredHeader}"`
        );
      }
    }

    const data = rows
      .slice(1)
      .map((values, rowIndex) => {
        let currentHeader = '';
        try {
          if (values.length > headers.length) {
            values.length = headers.length;
          } else if (values.length < headers.length) {
            while (values.length < headers.length) {
              values.push('');
            }
          }

          const defect: any = headers.reduce((obj, header, index) => {
            currentHeader = header;
            let value = values[index];

            if (header === 'created' || header === 'updated') {
              const parsedDate = parseDate(value);
              if (!parsedDate && header === 'created') {
                throw new Error(`Invalid or empty date in '${header}' column.`);
              }
              value = parsedDate ? parsedDate.toISOString() : '';
            }

            const key = header as keyof Defect | 'issue_key' | 'created' | 'reporter' | 'issue_type' | 'custom_field_business_domain' | 'description';

            if (key === 'issue_key') {
              obj['id'] = value;
            } else if (key === 'created') {
              obj['created_at'] = value;
            } else if (key === 'reporter') {
              obj['reported_by'] = value;
            } else if (key === 'custom_field_business_domain') {
              obj['domain'] = value;
            } else if (key === 'description') {
              obj['description'] = value;
            } else if (Object.keys(DefectSchema.shape).includes(key)) {
              obj[key] = value;
            }
            return obj;
          }, {} as any);

          if (!defect.id || !defect.summary || !defect.created_at) {
            return null;
          }
          return defect;
        } catch (cellError: any) {
          throw new Error(
            `Error parsing row ${
              rowIndex + 2
            } at cell "${currentHeader}". Details: ${cellError.message}`
          );
        }
      })
      .filter((d): d is Defect => d !== null);

    if (data.length === 0) {
      throw new Error(
        'No valid defect data could be parsed from the file. Please check the console for warnings about skipped rows.'
      );
    }
    
    const timestamp = new Date().toISOString();
    const fileContent = JSON.stringify({ defects: data, timestamp });

    await fs.writeFile(defectsFilePath, fileContent, 'utf-8');

    return {success: true, count: data.length, timestamp};
  } catch (error) {
    console.error('Error during defect upload:', error);
    return {
      success: false,
      count: 0,
      error: error instanceof Error ? error.message : 'An unknown error occurred.',
    };
  }
}

/**
 * Retrieves the stored defect data from the server-side file.
 * @returns An array of Defect objects or an empty array if not found.
 */
export async function getDefects(): Promise<{defects: Defect[], timestamp: string | null}> {
  try {
    const fileContent = await fs.readFile(defectsFilePath, 'utf-8');
    const data = JSON.parse(fileContent);
    return { defects: data.defects || [], timestamp: data.timestamp || null };
  } catch (error) {
    // If the file doesn't exist, it's not an error, just means no data yet.
    if (isNodeError(error) && error.code === 'ENOENT') {
        return { defects: [], timestamp: null };
    }
    console.error('Error reading defects file:', error);
    return { defects: [], timestamp: null };
  }
}

/**
 * Clears the stored defect data from the server.
 */
export async function clearDefects(): Promise<{success: boolean, error?: string}> {
    try {
        await fs.unlink(defectsFilePath);
        return { success: true };
    } catch (error) {
        if (isNodeError(error) && error.code === 'ENOENT') {
            return { success: true }; // File already deleted
        }
        console.error('Error clearing defects file:', error);
        return { success: false, error: 'Failed to clear data on the server.' };
    }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && 'code' in error;
}
