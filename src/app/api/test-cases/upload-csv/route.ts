import { NextResponse } from "next/server";
import { getMongoDetails } from "@/lib/mongodb";

const parseCSV = (text: string): { headers: string[], data: any[] } => {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;
    let i = 0;

    const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    while (i < normalizedText.length) {
        const char = normalizedText[i];
        if (inQuotes) {
            if (char === '"') {
                if (i + 1 < normalizedText.length && normalizedText[i + 1] === '"') {
                    currentField += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                currentField += char;
            }
        } else {
            if (char === ',') {
                currentRow.push(currentField);
                currentField = '';
            } else if (char === '\n') {
                currentRow.push(currentField);
                rows.push(currentRow);
                currentRow = [];
                currentField = '';
            } else if (char === '"' && currentField === '') {
                inQuotes = true;
            } else {
                currentField += char;
            }
        }
        i++;
    }
    if (currentField || currentRow.length > 0) {
        currentRow.push(currentField);
        rows.push(currentRow);
    }
    
    const nonEmptyRows = rows.filter(row => row.some(field => field.trim() !== ''));
    if (nonEmptyRows.length < 1) {
        return { headers: [], data: [] };
    }

    const headerRow = nonEmptyRows[0].map(h => h.trim());
    const dataRows = nonEmptyRows.slice(1);
    
    const uniqueHeaders: string[] = [];
    const headerMap: { [key: string]: number[] } = {};

    headerRow.forEach((header, index) => {
        if (!headerMap[header]) {
            headerMap[header] = [];
            uniqueHeaders.push(header);
        }
        headerMap[header].push(index);
    });

    const data = dataRows.map(row => {
        const rowData: any = {};
        uniqueHeaders.forEach(header => {
            const indices = headerMap[header];
            const values = indices.map(index => row[index]).filter(Boolean); // Filter out empty/null values
            rowData[header] = values.join(',');
        });
        return rowData;
    });

    return { headers: uniqueHeaders, data };
};


export async function POST(request: Request) {
  try {
    const { client, dbName } = await getMongoDetails();
    const db = client.db(dbName);

    const body = await request.json();
    const { csv, uploaderId, fileName } = body;

    if (!csv || !uploaderId || !fileName) {
        return NextResponse.json({ error: "Invalid data format. CSV, uploaderId, and fileName are required." }, { status: 400 });
    }

    const { data: parsedTestCases } = parseCSV(csv);
    if (parsedTestCases.length === 0) {
        return NextResponse.json({ error: "No data found in the CSV file." }, { status: 400 });
    }
    
    const fileDoc = {
        fileName,
        testCases: parsedTestCases,
        uploaderId,
        uploadedAt: new Date().toISOString(),
    };

    const result = await db.collection("testCases").insertOne(fileDoc);

    return NextResponse.json({ success: true, fileId: result.insertedId, count: parsedTestCases.length });
  } catch (e: any) {
    console.error("Failed to upload test cases from CSV:", e);
    return NextResponse.json(
      { error: "Failed to upload test cases from CSV.", details: e.toString() },
      { status: 500 }
    );
  }
}
