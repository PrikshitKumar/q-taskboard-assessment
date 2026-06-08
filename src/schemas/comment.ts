import { z } from "zod";

export const createCommentSchema = z.object({
  body: z.string().min(1, "comment cannot be empty").max(10000),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
