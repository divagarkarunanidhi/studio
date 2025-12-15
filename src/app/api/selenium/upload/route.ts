
import { NextResponse } from "next/server";
import { getMongoDetails } from "@/lib/mongodb";

export async function POST(request: Request) {
  try {
    const { clientPromise, dbName } = await getMongoDetails();
    const body = await request.json();
    const { fileData, uploaderId, fileName } = body;

    // fileData is the entire JSON object from the uploaded file
    if (!fileData || typeof fileData !== 'object' || !uploaderId || !fileName) {
        return NextResponse.json({ error: "Invalid data format." }, { status: 400 });
    }
    
    // We store the entire JSON content in a 'fileData' field
    const docToInsert = {
        fileName,
        fileData, // The entire JSON object is stored here
        uploaderId,
        uploadedAt: new Date().toISOString(),
    };

    const client = await clientPromise;
    const db = client.db(dbName);

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
    
