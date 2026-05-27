import { z } from "zod";
import { getMessages, normalizeLocaleCode } from "@/i18n/messages";
import type { CompareRequest, LocaleCode } from "@/lib/types";

function createGitHubUsernameSchema(locale: LocaleCode) {
  const messages = getMessages(locale).validation.githubUsername;

  return z
    .string()
    .trim()
    .min(1, messages.required)
    .max(39, messages.tooLong)
    .regex(/^[a-zA-Z0-9-]+$/, messages.invalidCharacters)
    .refine((value) => !value.startsWith("-") && !value.endsWith("-"), {
      message: messages.edgeHyphen
    })
    .refine((value) => !value.includes("--"), {
      message: messages.consecutiveHyphens
    });
}

export const localeSchema = z.enum(["zh-CN", "en-US"]);

export const githubUsernameSchema = createGitHubUsernameSchema("zh-CN");

function createCompareRequestSchema(locale: LocaleCode) {
  const messages = getMessages(locale).validation;

  return z
    .object({
      users: z.tuple([createGitHubUsernameSchema(locale), createGitHubUsernameSchema(locale)]),
      locale: localeSchema.optional().default("zh-CN"),
      forceRefresh: z.boolean().optional().default(false)
    })
    .refine((value) => value.users[0].toLowerCase() !== value.users[1].toLowerCase(), {
      message: messages.compareDifferentUsers,
      path: ["users"]
    });
}

export const compareRequestSchema = createCompareRequestSchema("zh-CN");

function getRequestLocale(input: unknown): LocaleCode {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return "zh-CN";
  }

  const locale = (input as { locale?: unknown }).locale;
  return typeof locale === "string" ? normalizeLocaleCode(locale) : "zh-CN";
}

export function parseCompareRequest(input: unknown): CompareRequest {
  const parsed = createCompareRequestSchema(getRequestLocale(input)).parse(input);
  return {
    users: [parsed.users[0], parsed.users[1]],
    locale: parsed.locale,
    forceRefresh: parsed.forceRefresh
  };
}
