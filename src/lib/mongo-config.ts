import { promises as fs } from 'fs';
import path from 'path';

export interface MongoConfig {
  uri: string;
  dbName: string;
}

const DEFAULT_CONFIG: MongoConfig = {
  uri: 'mongodb://localhost:27017',
  dbName: 'bugsense',
};

const CONFIG_PATH = path.join(process.cwd(), 'data', 'mongo-config.json');

let cached: MongoConfig | null = null;

async function readFromDisk(): Promise<MongoConfig> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (typeof parsed?.uri === 'string' && typeof parsed?.dbName === 'string') {
      return { uri: parsed.uri, dbName: parsed.dbName };
    }
  } catch {
    // File missing or invalid — fall through to default.
  }
  return { ...DEFAULT_CONFIG };
}

export async function getMongoConfig(forceReload = false): Promise<MongoConfig> {
  if (!cached || forceReload) {
    cached = await readFromDisk();
  }
  return cached;
}

export async function saveMongoConfig(next: MongoConfig): Promise<MongoConfig> {
  if (!next.uri || !next.dbName) {
    throw new Error('Both uri and dbName are required.');
  }
  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(
    CONFIG_PATH,
    JSON.stringify({ uri: next.uri, dbName: next.dbName }, null, 2),
    'utf-8'
  );
  cached = { ...next };
  return cached;
}
