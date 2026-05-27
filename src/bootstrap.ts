// `pnpm bootstrap` — one-time setup. Using only the 1Claw HUMAN key (1ck_…), this
// provisions an agent (which gets its OWN ocv_ key), a secrets vault with a read
// policy, and a Base signing key, then stores third-party secrets (Bankr, Neynar)
// in the vault. It writes the agent's key + id + vault id to .env so `pnpm agent`
// runs with just the agent key and pulls every other secret from the vault.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import chalk from 'chalk';
import { loadConfig } from './config.js';
import { createAgent, createVault, grantAgentRead, provisionSigningKey, putSecret } from './clients/oneclaw-admin.js';
import { VAULT_SECRETS } from './secrets.js';

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
    console.error(chalk.red.bold('ONECLAW_HUMAN_API_KEY is required'));
    console.error(chalk.dim('  set your 1ck_… key in .env — see https://docs.1claw.xyz\n'));
    process.exit(1);
  }

  // 1. Create the agent (Base intents enabled) — it receives its own ocv_ key.
  const { agentId, agentApiKey } = await createAgent(config, 'reference-agent');
  console.log(chalk.green('✓ agent created') + chalk.dim(`  ${agentId}`));

  // 2. Provision its Base signing key (HSM-held).
  const address = await provisionSigningKey(config, agentId, 'base');
  console.log(chalk.green('✓ base signing key') + chalk.dim(`  ${address}`));

  // 3. Create a vault for third-party secrets and let the agent read it.
  const vaultId = await createVault(config, 'reference-agent-secrets');
  await grantAgentRead(config, vaultId, agentId);
  console.log(chalk.green('✓ vault + read policy') + chalk.dim(`  ${vaultId}`));

  // 4. Prompt for third-party secrets and store them in the vault (TTY only).
  let stored = 0;
  if (process.stdin.isTTY) {
    console.log(chalk.cyan('\nstoring secrets in the 1Claw vault (press enter to skip any):'));
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      for (const secret of VAULT_SECRETS) {
        const value = (await rl.question(chalk.cyan(`  ${secret.prompt}: `))).trim();
        if (!value) continue;
        await putSecret(config, vaultId, secret.vaultName, value);
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

  // 5. Persist the agent's own credentials — the only secrets the runtime needs.
  const envPath = resolve(process.cwd(), '.env');
  upsertEnv(envPath, {
    ONECLAW_AGENT_ID: agentId,
    ONECLAW_AGENT_API_KEY: agentApiKey,
    ONECLAW_VAULT_ID: vaultId,
  });

  console.log(chalk.green.bold('\n✓ bootstrap complete'));
  console.log(`  ${chalk.dim('agent key + id + vault written to')} ${envPath}`);
  console.log(`  ${chalk.dim('secrets stored in vault:')} ${stored}`);
  console.log(chalk.cyan('\nnext: pnpm agent\n'));
}

main().catch((err) => {
  console.error(chalk.red(`bootstrap failed: ${err instanceof Error ? err.message : String(err)}`));
  process.exit(1);
});
