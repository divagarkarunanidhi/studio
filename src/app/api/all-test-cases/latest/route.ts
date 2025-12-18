
import { NextResponse } from "next/server";
import { getMongoDetails } from "@/lib/mongodb";

export async function GET() {
  try {
    const { clientPromise, dbName } = await getMongoDetails();
    const client = await clientPromise;
    const db = client.db(dbName);

    const latestFile = await db
      .collection("AllTestCase")
      .find({})
      .sort({ uploadedAt: -1 })
      .limit(1)
      .toArray();

    if (latestFile.length === 0) {
      return NextResponse.json(null);
    }
    
    // MongoDB returns _id, so we can remove it if we don't need it.
    const { _id, ...fileData } = latestFile[0];

    return NextResponse.json(fileData);
  } catch (e: any) {
    console.error("Failed to fetch latest test cases:", e);
    return NextResponse.json(
      { error: "Failed to fetch latest test cases.", details: e.toString() },
      { status: 500 }
    );
  }
}
