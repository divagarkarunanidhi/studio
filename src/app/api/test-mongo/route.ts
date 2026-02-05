import { NextResponse } from "next/server";
import { getMongoDetails } from "@/lib/mongodb";

export async function GET() {
  try {
    // When testing the connection, we pass true to force a refresh of the configuration from Firestore.
    // This ensures that the user sees the result of the NEW connection string they just saved immediately.
    const { client, dbName } = await getMongoDetails(true);
    
    // Test the connection with a lightweight ping
    await client.db(dbName).admin().ping();
    
    return NextResponse.json({ success: true, message: "MongoDB connection is healthy with the latest configuration!" });
  } catch (e: any) {
    console.error("MongoDB connection test failed:", e);
    
    let errorMessage = "Failed to connect to MongoDB.";
    if (e.name === 'MongoNetworkError') {
      errorMessage = "Network error. Check if the IP address is whitelisted in MongoDB Atlas.";
    } else if (e.name === 'MongoAuthenticationError') {
      errorMessage = "Authentication failed. Check your username and password in the URI.";
    } else {
      errorMessage = e.message || "An unknown error occurred.";
    }

    return NextResponse.json(
      { success: false, message: "MongoDB connection failed.", error: errorMessage },
      { status: 500 }
    );
  }
}
