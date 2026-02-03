import { NextResponse } from "next/server";
import { getMongoDetails } from "@/lib/mongodb";

export async function GET() {
  try {
    const { client, dbName } = await getMongoDetails();
    
    // Test the singleton connection with a lightweight ping
    await client.db(dbName).admin().ping();
    
    return NextResponse.json({ success: true, message: "MongoDB shared connection is healthy!" });
  } catch (e: any) {
    console.error("MongoDB connection test failed:", e);
    
    let errorMessage = "Failed to connect to MongoDB.";
    if (e.name === 'MongoNetworkError') {
      errorMessage = "Network error. Check if the IP address is whitelisted.";
    } else if (e.name === 'MongoAuthenticationError') {
      errorMessage = "Authentication failed. Check credentials in Firestore config.";
    } else {
      errorMessage = e.message || "An unknown error occurred.";
    }

    return NextResponse.json(
      { success: false, message: "MongoDB connection failed.", error: errorMessage },
      { status: 500 }
    );
  }
}
