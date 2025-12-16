
import { NextResponse } from "next/server";
import { getMongoDetails } from "@/lib/mongodb";

export async function POST(request: Request) {
  try {
    const { clientPromise, dbName } = await getMongoDetails();
    const body = await request.json();
    const { fileData, uploaderId, fileName } = body;

    // Updated validation: check if fileData is an object and has test_results
    if (typeof fileData !== 'object' || fileData === null || !Array.isArray(fileData.test_results) || !uploaderId || !fileName) {
        return NextResponse.json({ error: "Invalid data format. Expecting an object with 'fileData', 'uploaderId', and 'fileName'." }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db(dbName);
    
    const docToInsert = {
        fileName,
        fileData, // The entire JSON object is stored
        uploaderId,
        uploadedAt: new Date().toISOString(),
    };

    const result = await db.collection("seleniumReports").insertOne(docToInsert);

    return NextResponse.json({ success: true, fileId: result.insertedId });
  } catch (e: any) {
    console.error("Failed to upload selenium report:", e);
    return NextResponse.json(
      { error: "Failed to upload selenium report.", details: e.toString() },
      { status: 500 }
    );
  }
}
