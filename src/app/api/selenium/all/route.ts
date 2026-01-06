
import { NextResponse } from "next/server";
import { getMongoDetails } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function GET() {
  try {
    const { clientPromise, dbName } = await getMongoDetails();
    const client = await clientPromise;
    const db = client.db(dbName);
    const collection = db.collection("seleniumReports");

    // Ensure an index exists on the 'uploadedAt' field for efficient sorting
    await collection.createIndex({ uploadedAt: -1 });

    const allFiles = await collection
      .find({})
      .sort({ uploadedAt: -1 })
      .toArray();

    if (allFiles.length === 0) {
      return NextResponse.json([]);
    }
    
    // Convert ObjectId to string for each document
    const serializableFiles = allFiles.map(file => ({
      ...file,
      _id: (file._id as ObjectId).toString(),
    }));

    return NextResponse.json(serializableFiles);
  } catch (e: any) {
    console.error("Failed to fetch all selenium reports:", e);
    return NextResponse.json(
      { error: "Failed to fetch reports.", details: e.toString() },
      { status: 500 }
    );
  }
}

    