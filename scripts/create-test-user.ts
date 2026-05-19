import bcrypt from 'bcrypt';
import { MongoClient } from 'mongodb';

async function createTestUser() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();

  try {
    const db = client.db('bugsense');
    const users = db.collection('users');

    // Check if user already exists
    const existingUser = await users.findOne({ email: 'admin@bugsense.com' });
    if (existingUser) {
      console.log('Test user already exists');
      return;
    }

    // Hash the password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash('password123', saltRounds);

    // Create the user
    const testUser = {
      email: 'admin@bugsense.com',
      username: 'admin',
      displayName: 'Admin User',
      role: 'admin' as const,
      passwordHash,
      createdAt: new Date(),
    };

    const result = await users.insertOne(testUser);
    console.log('Test user created with ID:', result.insertedId);
  } finally {
    await client.close();
  }
}

createTestUser().catch(console.error);