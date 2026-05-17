import { z } from "zod";

import {
  INTEREST_STAGE_OPTIONS,
  NOTE_TYPE_OPTIONS,
  TASK_PRIORITY_OPTIONS,
} from "@/types/customers";

export const categoryInterestSchema = z.object({
  categoryId: z.string().min(1, "Kategori secin."),
  stage: z.enum(INTEREST_STAGE_OPTIONS),
  notes: z.string().trim().max(2000),
});

export type CategoryInterestInput = z.infer<typeof categoryInterestSchema>;

export const customerInterestSchema = z.object({
  productId: z.string().min(1, "Urun secin."),
  quantity: z.number().int().min(1, "Miktar en az 1 olmali."),
  quotedPrice: z.string().trim().max(40),
  currency: z.string().trim().min(1, "Para birimi gerekli.").max(12),
  stage: z.enum(INTEREST_STAGE_OPTIONS),
  notes: z.string().trim().max(2000),
});

export type CustomerInterestInput = z.infer<typeof customerInterestSchema>;

export const customerTimelineNoteSchema = z.object({
  note: z.string().trim().min(2, "Not gerekli.").max(2000),
  type: z.enum(NOTE_TYPE_OPTIONS),
});

export type CustomerTimelineNoteInput = z.infer<typeof customerTimelineNoteSchema>;

export const customerTaskSchema = z.object({
  title: z.string().trim().min(2, "Gorev basligi gerekli.").max(160),
  description: z.string().trim().max(2000),
  dueDate: z.string().trim(),
  priority: z.enum(TASK_PRIORITY_OPTIONS),
  assignedToId: z.string().optional(),
});

export type CustomerTaskInput = z.infer<typeof customerTaskSchema>;
