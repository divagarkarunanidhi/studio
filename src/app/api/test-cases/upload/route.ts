
import { NextResponse } from "next/server";
import { getMongoDetails } from "@/lib/mongodb";

export async function POST(request: Request) {
  try {
    const { clientPromise, dbName } = await getMongoDetails();
    const body = await request.json();
    const { testCases, uploaderId, fileName } = body;

    if (!Array.isArray(testCases) || !uploaderId || !fileName) {
        return NextResponse.json({ error: "Invalid data format." }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db(dbName);
    
    const fileDoc = {
        fileName,
        testCases,
        uploaderId,
        uploadedAt: new Date().toISOString(),
    };

    const result = await db.collection("testCases").insertOne(fileDoc);

    return NextResponse.json({ success: true, fileId: result.insertedId });
  } catch (e: any) {
    console.error("Failed to upload test cases:", e);
    return NextResponse.json(
      { error: "Failed to upload test cases.", details: e.toString() },
      { status: 500 }
    );
  }
}

    