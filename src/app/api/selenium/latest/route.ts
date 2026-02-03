
import { NextResponse } from "next/server";
import { getMongoDetails } from "@/lib/mongodb";

export async function GET() {
  let client;
  try {
    const details = await getMongoDetails();
    client = details.client;
    const db = client.db(details.dbName);

    // Sort by _id for performance, as it's indexed and contains a timestamp.
    const latestFile = await db
      .collection("seleniumReports")
      .find({})
      .sort({ _id: -1 })
      .limit(1)
      .toArray();

    if (latestFile.length === 0) {
      return NextResponse.json(null);
    }
    
    // MongoDB returns _id, so we can remove it if we don't need it.
    const { _id, ...fileData } = latestFile[0];

    return NextResponse.json(fileData);
  } catch (e: any) {
    console.error("Failed to fetch latest selenium report:", e);
    return NextResponse.json(
      { error: "Failed to fetch latest report.", details: e.toString() },
      { status: 500 }
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
}
