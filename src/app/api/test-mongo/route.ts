
import { NextResponse } from "next/server";
import { getMongoDetails } from "@/lib/mongodb";

export async function GET() {
  let client;
  try {
    const details = await getMongoDetails();
    client = details.client;
    
    // The command { ping: 1 } is a lightweight and standard way to test the connection.
    await client.db().admin().ping();
    
    return NextResponse.json({ success: true, message: "MongoDB connection successful!" });
  } catch (e: any) {
    console.error("MongoDB connection test failed:", e);
    
    // Provide a more specific error message if possible
    let errorMessage = "Failed to connect to MongoDB.";
    if (e.name === 'MongoNetworkError') {
      errorMessage = "Network error. Check if the IP address is whitelisted or if the server is reachable.";
    } else if (e.name === 'MongoAuthenticationError') {
      errorMessage = "Authentication failed. Please check your username and password in the URI.";
    } else {
      errorMessage = e.message || "An unknown error occurred.";
    }

    return NextResponse.json(
      { success: false, message: "MongoDB connection failed.", error: errorMessage },
      { status: 500 }
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
}
