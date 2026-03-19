import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { TASK_SIZES, type TaskSize } from "@/lib/types";

const taskSchema = z.object({
  name: z.string().trim().min(1),
  size: z.enum(TASK_SIZES)
});

const householdConfigSchema = z.object({
  householdName: z.string().trim().min(1),
  members: z.array(z.string().trim().min(1)).min(1),
  tasks: z.array(taskSchema).min(1)
});

export type HouseholdConfig = {
  householdName: string;
  members: string[];
  tasks: { name: string; size: TaskSize }[];
};

function uniqueOrThrow(values: string[], label: string) {
  const normalized = values.map((value) => value.trim().toLocaleLowerCase());
  const duplicates = normalized.filter((value, index) => normalized.indexOf(value) !== index);

  if (duplicates.length > 0) {
    throw new Error(`Duplicate ${label} in household config: ${duplicates[0]}`);
  }
}

export async function loadHouseholdConfig(): Promise<HouseholdConfig> {
  const configuredPath = process.env.HOUSEHOLD_CONFIG_PATH ?? "./data/gumabyt.json";
  const absolutePath = path.isAbsolute(configuredPath)
    ? configuredPath
    : path.join(process.cwd(), configuredPath);
  const raw = await readFile(absolutePath, "utf8");
  const parsed = householdConfigSchema.parse(JSON.parse(raw));

  uniqueOrThrow(parsed.members, "member");
  uniqueOrThrow(parsed.tasks.map((task) => task.name), "task");

  return parsed;
}
