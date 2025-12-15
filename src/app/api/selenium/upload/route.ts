
import { NextResponse } from "next/server";
import { getMongoDetails } from "@/lib/mongodb";

export async function POST(request: Request) {
  try {
    const { clientPromise, dbName } = await getMongoDetails();
    const body = await request.json();
    const { report, uploaderId, fileName } = body;

    if (!Array.isArray(report) || !uploaderId || !fileName) {
        return NextResponse.json({ error: "Invalid data format." }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db(dbName);
    
    const fileDoc = {
        fileName,
        report,
        uploaderId,
        uploadedAt: new Date().toISOString(),
    };

    const result = await db.collection("seleniumReports").insertOne(fileDoc);

    return NextResponse.json({ success: true, fileId: result.insertedId });
  } catch (e: any) {
    console.error("Failed to upload selenium report:", e);
    return NextResponse.json(
      { error: "Failed to upload selenium report.", details: e.toString() },
      { status: 500 }
    );
  }
}

    