import { NextResponse } from "next/server";
import { getMongoDetails } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

/**
 * GET /api/selenium/details?id=[reportId]
 * Fetches the full Selenium report document using the shared singleton connection.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: "Missing report ID." }, { status: 400 });
    }

    const { client, dbName } = await getMongoDetails();
    const db = client.db(dbName);

    const report = await db.collection("seleniumReports").findOne({ _id: new ObjectId(id) });

    if (!report) {
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    }

    return NextResponse.json(report);
  } catch (e: any) {
    console.error("Failed to fetch report details:", e);
    return NextResponse.json(
      { error: "Failed to fetch report details.", details: e.toString() },
      { status: 500 }
    );
  }
}
