
import { NextResponse } from "next/server";
import { getMongoDetails } from "@/lib/mongodb";

export async function POST(request: Request) {
  try {
    const { clientPromise, dbName } = await getMongoDetails();
    const body = await request.json();
    // Destructure all expected top-level fields from the uploaded JSON
    const { fileData, uploaderId, fileName } = body;
    const { solution, environment, Config, "Report Path": reportPath, test_results } = fileData;

    // Validate that the essential parts are present
    if (!test_results || !Array.isArray(test_results) || !uploaderId || !fileName || !solution) {
        return NextResponse.json({ error: "Invalid data format. Expecting an object with 'fileData' (containing 'test_results', 'solution', etc.), 'uploaderId', and 'fileName'." }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db(dbName);
    
    // Construct the document to be inserted with top-level fields
    const docToInsert = {
        fileName,
        solution,
        environment,
        Config,
        "Report Path": reportPath,
        test_results,
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
