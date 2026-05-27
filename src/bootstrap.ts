// `pnpm bootstrap` — one-time setup. Using only the 1Claw HUMAN API key, this
// provisions an agent (which gets its OWN scoped API key), attaches a policy,
// and stores the third-party secrets (Bankr, Neynar, …) in the agent's vault.
// It writes the agent's key + id to .env so `pnpm agent` runs with just that key
// and pulls every other secret from the vault. Run it once, then `pnpm agent`.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import chalk from 'chalk';
import { loadConfig } from './config.js';
import { createAgent, attachPolicy, putSecret } from './clients/oneclaw-admin.js';
import { VAULT_SECRETS } from './secrets.js';

// Base-only guardrails for the agent's signing key — illustrative defaults.
const DEFAULT_POLICY = {
  chains: [8453],
  maxTransactionValueWei: '0', // contract calls only, no native value transfers
  description: '1Claw reference agent — Base only',
};

function upsertEnv(file: string, updates: Record<string, string>): void {
  let content = existsSync(file)
    ? readFileSync(file, 'utf8')
    : existsSync('.env.example')
      ? readFileSync('.env.example', 'utf8')
      : '';
  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, 'm');
    if (re.test(content)) content = content.replace(re, line);
    else content += `${content && !content.endsWith('\n') ? '\n' : ''}${line}\n`;
  }
  writeFileSync(file, content);
}

async function main(): Promise<void> {
  const config = loadConfig();
  console.log(chalk.cyan.bold('\n1Claw bootstrap — provisioning your agent\n'));
  if (!config.ONECLAW_HUMAN_API_KEY) {
    console.log(chalk.yellow('⚠ no ONECLAW_HUMAN_API_KEY set — simulating provisioning locally.'));
    console.log(chalk.dim('  set it in .env to provision a real agent + vault.\n'));
  }

  // 1. Create the agent (it receives its own scoped API key).
  const { agentId, agentApiKey } = await createAgent(config, 'reference-agent');
  console.log(chalk.green('✓ agent created'));
  console.log(`  ${chalk.dim('agentId:')} ${agentId}`);

  // 2. Attach guardrails.
  await attachPolicy(config, agentId, DEFAULT_POLICY);
  console.log(chalk.green('✓ policy attached') + chalk.dim('  (Base only, no native value)'));

  // 3. Prompt for third-party secrets and store them in the agent's vault.
  //    Skipped when stdin isn't a TTY (CI / piped input) so bootstrap never hangs.
  let stored = 0;
  if (process.stdin.isTTY) {
    console.log(chalk.cyan('\nstoring secrets in the 1Claw vault (press enter to skip any):'));
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      for (const secret of VAULT_SECRETS) {
        const value = (await rl.question(chalk.cyan(`  ${secret.prompt}: `))).trim();
        if (!value) continue;
        await putSecret(config, agentId, secret.vaultName, value);
        console.log(chalk.green(`    ✓ stored ${secret.vaultName}`));
        stored++;
      }
    } finally {
      rl.close();
    }
  } else {
    console.log(chalk.dim('\n  non-interactive stdin — skipping secret prompts.'));
    console.log(chalk.dim('  re-run `pnpm bootstrap` in a terminal to store Bankr/Neynar secrets.'));
  }

  // 4. Persist the agent's own credentials — the only secrets the runtime needs.
  const envPath = resolve(process.cwd(), '.env');
  upsertEnv(envPath, { ONECLAW_AGENT_ID: agentId, ONECLAW_AGENT_API_KEY: agentApiKey });

  console.log(chalk.green.bold('\n✓ bootstrap complete'));
  console.log(`  ${chalk.dim('agent key + id written to')} ${envPath}`);
  console.log(`  ${chalk.dim('secrets stored in vault:')} ${stored}`);
  console.log(chalk.cyan('\nnext: pnpm agent\n'));
}

main().catch((err) => {
  console.error(chalk.red(`bootstrap failed: ${err instanceof Error ? err.message : String(err)}`));
  process.exit(1);
});
