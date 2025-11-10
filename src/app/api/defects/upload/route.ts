import { NextResponse } from "next/server";
import { clientPromise, dbName } from "@/lib/mongodb";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { defects, uploaderId } = body;

    if (!Array.isArray(defects) || !uploaderId) {
        return NextResponse.json({ error: "Invalid data format." }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db(dbName);
    
    const fileDoc = {
        defects,
        uploaderId,
        uploadedAt: new Date().toISOString(),
    };

    const result = await db.collection("defectFiles").insertOne(fileDoc);

    return NextResponse.json({ success: true, fileId: result.insertedId });
  } catch (e: any) {
    console.error("Failed to upload defects:", e);
    return NextResponse.json(
      { error: "Failed to upload defects.", details: e.toString() },
      { status: 500 }
    );
  }
}
