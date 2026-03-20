import "dotenv/config";

import { getPool, waitForDatabase } from "@/lib/db";
import { loadHouseholdConfig } from "@/lib/config";

const pointsBySize = {
  XS: 1,
  S: 2,
  M: 3,
  L: 4
} as const;

async function main() {
  const config = await loadHouseholdConfig();
  const pool = getPool();
  await waitForDatabase();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `
        INSERT INTO app_meta (key, value)
        VALUES ('household_name', $1)
        ON CONFLICT (key) DO UPDATE
          SET value = EXCLUDED.value
      `,
      [config.householdName]
    );

    const configTaskNames = new Set(config.tasks.map((task) => task.name));

    await client.query("DELETE FROM members WHERE name <> ALL($1::text[])", [config.members]);
    await client.query("DELETE FROM tasks WHERE name <> ALL($1::text[])", [config.tasks.map((task) => task.name)]);

    for (const memberName of config.members) {
      await client.query(
        `
          INSERT INTO members (name)
          VALUES ($1)
          ON CONFLICT (name) DO NOTHING
        `,
        [memberName]
      );
    }

    for (const task of config.tasks) {
      await client.query(
        `
          INSERT INTO tasks (name, size, points)
          VALUES ($1, $2, $3)
          ON CONFLICT (name) DO UPDATE
            SET size = EXCLUDED.size,
                points = EXCLUDED.points
        `,
        [task.name, task.size, pointsBySize[task.size]]
      );
    }

    await client.query(
      `
        UPDATE day_entries
        SET task_1_id = NULL,
            updated_at = NOW()
        WHERE task_1_id IS NOT NULL
          AND task_1_id NOT IN (SELECT id FROM tasks WHERE name = ANY($1::text[]))
      `,
      [Array.from(configTaskNames)]
    );

    await client.query(
      `
        UPDATE day_entries
        SET task_2_id = NULL,
            updated_at = NOW()
        WHERE task_2_id IS NOT NULL
          AND task_2_id NOT IN (SELECT id FROM tasks WHERE name = ANY($1::text[]))
      `,
      [Array.from(configTaskNames)]
    );

    await client.query("COMMIT");
    console.log("Database seeded.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
