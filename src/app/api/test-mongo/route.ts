
import { NextResponse } from "next/server";
import { getMongoDetails } from "@/lib/mongodb";
import { MongoClient } from "mongodb";

export async function GET() {
  try {
    const { clientPromise } = await getMongoDetails();
    const client: MongoClient = await clientPromise;
    
    // The command { ping: 1 } is a lightweight and standard way to test the connection.
    await client.db().admin().ping();
    
    // If ping is successful, close the connection to be clean.
    // Note: Depending on how clientPromise is managed globally, you might not want to close it.
    // In this setup, a new connection is established, so closing is fine.
    // await client.close();
    
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
  }
}
