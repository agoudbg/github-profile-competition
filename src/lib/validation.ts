import { z } from "zod";
import { zhCN } from "@/i18n/messages";
import type { CompareRequest } from "@/lib/types";

export const githubUsernameSchema = z
  .string()
  .trim()
  .min(1, zhCN.validation.githubUsername.required)
  .max(39, zhCN.validation.githubUsername.tooLong)
  .regex(/^[a-zA-Z0-9-]+$/, zhCN.validation.githubUsername.invalidCharacters)
  .refine((value) => !value.startsWith("-") && !value.endsWith("-"), {
    message: zhCN.validation.githubUsername.edgeHyphen
  })
  .refine((value) => !value.includes("--"), {
    message: zhCN.validation.githubUsername.consecutiveHyphens
  });

export const localeSchema = z.enum(["zh-CN", "en-US"]);

export const compareRequestSchema = z
  .object({
    users: z.tuple([githubUsernameSchema, githubUsernameSchema]),
    locale: localeSchema.optional().default("zh-CN"),
    forceRefresh: z.boolean().optional().default(false)
  })
  .refine((value) => value.users[0].toLowerCase() !== value.users[1].toLowerCase(), {
    message: zhCN.validation.compareDifferentUsers,
    path: ["users"]
  });

export function parseCompareRequest(input: unknown): CompareRequest {
  const parsed = compareRequestSchema.parse(input);
  return {
    users: [parsed.users[0], parsed.users[1]],
    locale: parsed.locale,
    forceRefresh: parsed.forceRefresh
  };
}
