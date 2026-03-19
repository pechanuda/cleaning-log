import "dotenv/config";

import { getPool, waitForDatabase } from "@/lib/db";
import { schemaSql } from "@/lib/db-schema";

const shouldReset = process.argv.includes("--reset");

async function ensureCompositeDayEntries() {
  const pool = getPool();
  const tableExists = await pool.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'day_entries'
      ) AS exists
    `
  );

  if (!tableExists.rows[0]?.exists) {
    return;
  }

  const primaryKeyColumns = await pool.query<{ column_name: string }>(
    `
      SELECT a.attname AS column_name
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indrelid
      JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS cols(attnum, ord) ON TRUE
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = cols.attnum
      WHERE c.relname = 'day_entries' AND i.indisprimary
      ORDER BY cols.ord
    `
  );

  const primaryKey = primaryKeyColumns.rows.map((row) => row.column_name).join(",");
  const memberIdColumn = await pool.query<{ is_nullable: "YES" | "NO" }>(
    `
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'day_entries'
        AND column_name = 'member_id'
      LIMIT 1
    `
  );

  const alreadyCompatible =
    primaryKey === "date,member_id" && memberIdColumn.rows[0]?.is_nullable === "NO";

  if (alreadyCompatible) {
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS day_entries_v2 (
      date DATE NOT NULL,
      member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      task_1_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
      task_2_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (date, member_id),
      CHECK (task_1_id IS DISTINCT FROM task_2_id OR task_1_id IS NULL)
    )
  `);

  await pool.query(`
    INSERT INTO day_entries_v2 (date, member_id, task_1_id, task_2_id, updated_at)
    SELECT date, member_id, task_1_id, task_2_id, updated_at
    FROM day_entries
    WHERE member_id IS NOT NULL
    ON CONFLICT (date, member_id) DO NOTHING
  `);

  await pool.query("DROP TABLE day_entries");
  await pool.query("ALTER TABLE day_entries_v2 RENAME TO day_entries");
}

async function main() {
  const pool = getPool();
  await waitForDatabase();

  if (shouldReset) {
    await pool.query("DROP TABLE IF EXISTS day_entries, tasks, members, app_meta CASCADE");
  }

  await pool.query(schemaSql);
  await ensureCompositeDayEntries();
  console.log("Database schema is ready.");
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
