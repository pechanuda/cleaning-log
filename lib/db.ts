import { Pool, type PoolClient } from "pg";

declare global {
  var __cleaningLogPool__: Pool | undefined;
}

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  return databaseUrl;
}

export function getPool() {
  if (!global.__cleaningLogPool__) {
    global.__cleaningLogPool__ = new Pool({
      connectionString: getDatabaseUrl()
    });
  }

  return global.__cleaningLogPool__;
}

export async function waitForDatabase(options?: { retries?: number; delayMs?: number }) {
  const retries = options?.retries ?? 20;
  const delayMs = options?.delayMs ?? 1500;
  const pool = getPool();

  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (error) {
      lastError = error;

      if (attempt === retries) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Database did not become ready in time");
}

export async function withTransaction<T>(run: (client: PoolClient) => Promise<T>) {
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
