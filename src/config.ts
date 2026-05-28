// Loads + validates env with zod (step 0, before the loop runs).
//
// Two credentials matter: the 1Claw HUMAN key (used only by `pnpm bootstrap` to
// provision the agent) and the AGENT key (used by `pnpm agent` at runtime). All
// third-party secrets live in the 1Claw vault and are pulled in by src/secrets.ts,
// so a fully-provisioned run needs only ONECLAW_AGENT_API_KEY in .env.

import 'dotenv/config';
import { z } from 'zod';
import chalk from 'chalk';

const schema = z.object({
  // 1Claw
  ONECLAW_API_URL: z.string().url().default('https://api.1claw.xyz'),
  ONECLAW_HUMAN_API_KEY: z.string().default(''), // 1ck_… — bootstrap only
  ONECLAW_AGENT_API_KEY: z.string().default(''), // ocv_… — runtime; written by bootstrap
  ONECLAW_AGENT_ID: z.string().default(''), //      runtime; written by bootstrap
  ONECLAW_VAULT_ID: z.string().default(''), //      vault holding third-party secrets
  ONECLAW_AGENT_NAME: z.string().default(''), //    display name; written by bootstrap
  ONECLAW_VAULT_NAME: z.string().default(''), //    vault label; written by bootstrap
  BANKR_TOKEN_SYMBOL: z.string().default(''), //    ticker; written by bootstrap (e.g. AGENT)
  BANKR_TOKEN_NAME: z.string().default(''), //      full name; empty → Agent <id> at deploy
  BANKR_TOKEN_IMAGE: z.string().default(''), //      logo URL (https); optional, sent as `image` to Bankr
  // Reuse an existing Bankr launch — skips step 4 deploy when token address is set
  BANKR_EXISTING_TOKEN_ADDRESS: z.string().default(''),
  BANKR_EXISTING_POOL_ID: z.string().default(''),
  BANKR_EXISTING_DEPLOY_TX_HASH: z.string().default(''),
  // Run a subset of steps (inclusive), e.g. AGENT_START_STEP=5 AGENT_END_STEP=5
  AGENT_START_STEP: z.coerce.number().int().min(1).max(5).default(1),
  AGENT_END_STEP: z.coerce.number().int().min(1).max(5).default(5),
  AGENT_SWAP_DRY_RUN: z
    .enum(['', '0', '1', 'true', 'false'])
    .default('')
    .transform((v) => v === '1' || v === 'true'),
  // Shroud — OpenAI-compatible TEE LLM proxy (auths with the agent key by default)
  SHROUD_API_URL: z.string().url().default('https://shroud.1claw.xyz/v1'),
  SHROUD_API_KEY: z.string().default(''),
  SHROUD_MODEL: z.string().default('gpt-4o-mini'),
  SHROUD_PROVIDER: z.string().default(''),
  // GitLawb — decentralized git node (gl CLI handles identity/auth)
  GITLAWB_NODE_URL: z.string().url().default('https://node.gitlawb.com'),
  // Bankr — token launch (normally pulled from the vault, not set here)
  BANKR_API_URL: z.string().url().default('https://api.bankr.bot'),
  BANKR_API_KEY: z.string().default(''),
  // Farcaster fallback (normally pulled from the vault)
  NEYNAR_API_KEY: z.string().default(''),
  NEYNAR_SIGNER_UUID: z.string().default(''),
  FARCASTER_FID: z.string().default(''),
  // Base
  BASE_RPC_URL: z.string().url().default('https://mainnet.base.org'),
});

export type Config = z.infer<typeof schema>;

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

  return parsed.data;
}
