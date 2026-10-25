import { z } from "zod";

export const memberSessionSchema = z.object({
  memberId: z.string().uuid()
});

export const dayEntrySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum musí být ve formátu RRRR-MM-DD"),
    task1Id: z.string().uuid().nullable(),
    task2Id: z.string().uuid().nullable()
  })
  .refine((payload) => payload.task1Id !== payload.task2Id || payload.task1Id === null, {
    message: "Vybrané úkoly se musí lišit",
    path: ["task2Id"]
  });
