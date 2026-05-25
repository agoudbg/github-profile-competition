import { z } from "zod";
import type { CompareRequest } from "@/lib/types";

export const githubUsernameSchema = z
  .string()
  .trim()
  .min(1, "GitHub username is required.")
  .max(39, "GitHub username must be 39 characters or fewer.")
  .regex(/^[a-zA-Z0-9-]+$/, "GitHub username can only contain letters, numbers, and hyphens.")
  .refine((value) => !value.startsWith("-") && !value.endsWith("-"), {
    message: "GitHub username cannot start or end with a hyphen."
  })
  .refine((value) => !value.includes("--"), {
    message: "GitHub username cannot contain consecutive hyphens."
  });

export const localeSchema = z.enum(["zh-CN", "en-US"]);

export const compareRequestSchema = z
  .object({
    users: z.tuple([githubUsernameSchema, githubUsernameSchema]),
    locale: localeSchema.optional().default("zh-CN")
  })
  .refine((value) => value.users[0].toLowerCase() !== value.users[1].toLowerCase(), {
    message: "Please compare two different GitHub usernames.",
    path: ["users"]
  });

export function parseCompareRequest(input: unknown): CompareRequest {
  const parsed = compareRequestSchema.parse(input);
  return {
    users: [parsed.users[0], parsed.users[1]],
    locale: parsed.locale
  };
}
