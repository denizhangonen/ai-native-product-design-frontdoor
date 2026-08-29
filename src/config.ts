import { z } from "zod";

// An empty variable is "not set", not zero: "" must never turn a threshold into 0.
const blankToUndefined = (value: unknown) => (value === "" ? undefined : value);

export const configSchema = z.object({
  DATABASE_URL: z.string().min(1),
  /** Annual spend at or below this is guided on the spot; above it goes to procurement. */
  POLICY_THRESHOLD_USD_PER_YEAR: z.preprocess(
    blankToUndefined,
    z.coerce.number().min(0).max(10_000_000).default(1000),
  ),
  /** Where the guided reply points people for the spending policy. */
  POLICY_URL: z.string().url().default("https://example.com/spending-policy"),
  LLM_PROVIDER: z.enum(["fake", "openai"]).default("fake"),
  OPENAI_API_KEY: z.string().min(1).optional(),
  // Cheapest capable model; the prompts are short and the answers are tiny JSON.
  OPENAI_MODEL: z.string().default("gpt-4.1-nano"),
  // Below this, the message is treated as not understood rather than guessed at.
  MIN_PARSE_CONFIDENCE: z.preprocess(blankToUndefined, z.coerce.number().min(0).max(1).default(0.6)),
  EMAIL_PROVIDER: z.enum(["fake", "resend"]).default("fake"),
  RESEND_API_KEY: z.string().min(1).optional(),
  /** Signing secret of the Resend webhook, in `whsec_...` form. */
  RESEND_WEBHOOK_SECRET: z.string().min(1).optional(),
  EMAIL_FROM: z.string().default("Frontdoor <intake@example.com>"),
  EMAIL_REPLY_TO: z.string().default("intake@example.com"),
  /** Only these addresses may decide. Anyone else is logged and ignored. */
  PROCUREMENT_EMAILS: z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean),
    ),
  EMAIL_INBOUND_SECRET: z.string().min(1).optional(),
  /** Vercel sends this on scheduled calls. Unset means the cron route refuses everyone. */
  CRON_SECRET: z.string().min(1).optional(),
  // Optional until the Slack app is installed, so the rest of the app runs without it.
  SLACK_SIGNING_SECRET: z.string().min(1).optional(),
  SLACK_BOT_TOKEN: z.string().min(1).optional(),
  SLACK_CHANNEL_ID: z.string().min(1).optional(),
});

export type Config = z.infer<typeof configSchema>;

export type SlackConfig = {
  signingSecret: string;
  botToken: string;
  channelId: string;
};

let cached: Config | undefined;

export function getConfig(): Config {
  if (cached) return cached;

  const parsed = configSchema.safeParse(process.env);
  if (!parsed.success) {
    // Names only: values may be secrets.
    const keys = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid environment configuration: ${keys}`);
  }

  cached = parsed.data;
  return cached;
}

export function getSlackConfig(): SlackConfig | null {
  const config = getConfig();
  if (!config.SLACK_SIGNING_SECRET || !config.SLACK_BOT_TOKEN || !config.SLACK_CHANNEL_ID) {
    return null;
  }
  return {
    signingSecret: config.SLACK_SIGNING_SECRET,
    botToken: config.SLACK_BOT_TOKEN,
    channelId: config.SLACK_CHANNEL_ID,
  };
}
