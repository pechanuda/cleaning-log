import { z } from "zod";

export const memberSessionSchema = z.object({
  memberId: z.string().uuid()
});

export const dayEntrySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
    task1Id: z.string().uuid().nullable(),
    task2Id: z.string().uuid().nullable()
  })
  .refine((payload) => payload.task1Id !== payload.task2Id || payload.task1Id === null, {
    message: "Task selections must be different",
    path: ["task2Id"]
  });
