// Loads + validates env with zod (step 0, before the loop runs).
// URLs have sane defaults; credentials are optional so the agent runs against
// stubs out of the box. Missing credentials are reported as a checklist.

import 'dotenv/config';
import { z } from 'zod';
import chalk from 'chalk';

const schema = z.object({
  // 1Claw
  ONECLAW_API_URL: z.string().url().default('https://api.1claw.xyz'),
  ONECLAW_API_KEY: z.string().default(''),
  // Shroud
  SHROUD_API_URL: z.string().url().default('https://shroud.1claw.xyz/v1'),
  SHROUD_API_KEY: z.string().default(''),
  SHROUD_MODEL: z.string().default('claude-sonnet-4-5'),
  // GitLawb
  GITLAWB_API_URL: z.string().url().default('https://api.gitlawb.com'),
  GITLAWB_TOKEN: z.string().default(''),
  // Bankr / Farcaster fallback
  BANKR_API_URL: z.string().default(''),
  NEYNAR_API_KEY: z.string().default(''),
  NEYNAR_SIGNER_UUID: z.string().default(''),
  FARCASTER_FID: z.string().default(''),
  // Base
  BASE_RPC_URL: z.string().url().default('https://mainnet.base.org'),
});

export type Config = z.infer<typeof schema>;

// Credentials that real integrations need. Empty ones run against stubs for now.
// TODO(spec): once the real clients land, promote these to hard requirements.
const CREDENTIAL_KEYS: Array<keyof Config> = [
  'ONECLAW_API_KEY',
  'SHROUD_API_KEY',
  'GITLAWB_TOKEN',
];

export function loadConfig(): Config {
  const parsed = schema.safeParse(process.env);
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
