// Loads + validates env with zod (step 0, before the loop runs).
// URLs have sane defaults; credentials are optional so the agent runs against
// stubs out of the box. Missing credentials are reported as a checklist.

import 'dotenv/config';
import { z } from 'zod';
import chalk from 'chalk';

const schema = z.object({
  // 1Claw — vault + Intents
  ONECLAW_API_URL: z.string().url().default('https://api.1claw.xyz'),
  ONECLAW_API_KEY: z.string().default(''),
  ONECLAW_AGENT_ID: z.string().default(''),
  // Shroud — OpenAI-compatible TEE LLM proxy
  SHROUD_API_URL: z.string().url().default('https://shroud.1claw.xyz/v1'),
  SHROUD_API_KEY: z.string().default(''),
  SHROUD_MODEL: z.string().default('claude-sonnet-4-5'),
  SHROUD_PROVIDER: z.string().default(''),
  // GitLawb — decentralized git node (gl CLI handles identity/auth)
  GITLAWB_NODE_URL: z.string().url().default('http://localhost:7545'),
  // Bankr — token launch
  BANKR_API_URL: z.string().url().default('https://api.bankr.bot'),
  BANKR_API_KEY: z.string().default(''),
  // Farcaster fallback
  NEYNAR_API_KEY: z.string().default(''),
  NEYNAR_SIGNER_UUID: z.string().default(''),
  FARCASTER_FID: z.string().default(''),
  // Base
  BASE_RPC_URL: z.string().url().default('https://mainnet.base.org'),
});

export type Config = z.infer<typeof schema>;

// Credentials that real integrations need. Empty ones run against stubs for now.
// GitLawb has no key — its client probes for the `gl` CLI at runtime instead.
const CREDENTIAL_KEYS: Array<keyof Config> = [
  'ONECLAW_API_KEY',
  'SHROUD_API_KEY',
  'BANKR_API_KEY',
];

export function loadConfig(): Config {
  // Treat blank .env entries (e.g. `BANKR_API_URL=`) as unset so the schema
  // defaults apply, rather than failing URL validation on an empty string.
  const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ''));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    console.error(chalk.red.bold('config error — invalid environment:'));
    for (const issue of parsed.error.issues) {
      console.error(chalk.red(`  ✗ ${issue.path.join('.')}: ${issue.message}`));
    }
    console.error(chalk.dim('  copy .env.example to .env and fill in the keys.'));
    process.exit(1);
  }

  const missing = CREDENTIAL_KEYS.filter((k) => !parsed.data[k]);
  if (missing.length > 0) {
    console.log(chalk.yellow.bold('⚠ running with stubbed integrations — missing credentials:'));
    for (const key of missing) console.log(chalk.yellow(`  ○ ${key}`));
    console.log(chalk.dim('  these stages will return mock data until you fill in .env.\n'));
  }

  return parsed.data;
}
