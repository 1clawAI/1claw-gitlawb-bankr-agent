// `pnpm bootstrap` — one-time setup. Accepts the 1Claw HUMAN key (1ck_…) and third-party
// secrets (Bankr, Neynar) from .env or masked interactive prompts, provisions an agent
// + vault, stores third-party secrets in the vault, and writes agent credentials to .env.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import chalk from 'chalk';
import { resolveBootstrapProfile } from './bootstrap-settings.js';
import { loadConfig, type Config } from './config.js';
import { createAgent, createVault, grantAgentRead, provisionSigningKey, putSecret, SIGNING_KEY_CHAIN } from './clients/oneclaw-admin.js';
import { VAULT_SECRETS } from './secrets.js';
import { promptSecret } from './util/prompt-secret.js';

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

// Vault-held secrets must not remain in .env at runtime — clear them after storing.
function clearEnvKeys(file: string, keys: string[]): void {
  if (!existsSync(file)) return;
  let content = readFileSync(file, 'utf8');
  for (const key of keys) {
    const re = new RegExp(`^${key}=.*$`, 'm');
    if (re.test(content)) content = content.replace(re, `${key}=`);
    else content += `${content.endsWith('\n') || !content ? '' : '\n'}${key}=\n`;
  }
  writeFileSync(file, content);
}

async function resolveBootstrapSecret(
  label: string,
  envValue: string,
  interactive: boolean,
): Promise<string> {
  const fromEnv = envValue.trim();
  if (fromEnv) return fromEnv;
  if (!interactive) {
    throw new Error(`${label} is required — set it in .env or run \`pnpm bootstrap\` in a terminal`);
  }
  return promptSecret(chalk.cyan(`  ${label}: `));
}

async function main(): Promise<void> {
  const config = loadConfig();
  const interactive = process.stdin.isTTY;

  console.log(chalk.cyan.bold('\n1Claw bootstrap — provisioning your agent\n'));
  if (interactive) {
    console.log(
      chalk.dim('  set names/ticker in .env or answer prompts below; API keys are masked with *.\n'),
    );
  }

  console.log(chalk.cyan('agent profile:'));
  const profile = await resolveBootstrapProfile(config, interactive);
  console.log(chalk.green('✓ profile') + chalk.dim(`  agent=${profile.agentName}  vault=${profile.vaultName}  ticker=${profile.tokenSymbol}`));

  console.log(chalk.cyan('\napi keys:'));
  const humanKey = await resolveBootstrapSecret(
    '1Claw human API key (1ck_…)',
    config.ONECLAW_HUMAN_API_KEY,
    interactive,
  );
  const bankrKey = await resolveBootstrapSecret(
    'Bankr API key (bk_…, read-write + Token Launch) — stored in the 1Claw vault',
    config.BANKR_API_KEY,
    interactive,
  );

  const bootstrapConfig: Config = {
    ...config,
    ONECLAW_HUMAN_API_KEY: humanKey,
    ONECLAW_AGENT_NAME: profile.agentName,
    ONECLAW_VAULT_NAME: profile.vaultName,
    BANKR_TOKEN_SYMBOL: profile.tokenSymbol,
    BANKR_TOKEN_NAME: profile.tokenName,
  };

  // 1. Create the agent (Base intents enabled) — it receives its own ocv_ key.
  const { agentId, agentApiKey } = await createAgent(bootstrapConfig, profile.agentName);
  console.log(chalk.green('✓ agent created') + chalk.dim(`  ${profile.agentName}  ${agentId}`));

  // 2. Provision its EVM signing key (HSM-held; used for Base intents).
  const address = await provisionSigningKey(bootstrapConfig, agentId, SIGNING_KEY_CHAIN);
  console.log(chalk.green('✓ EVM signing key') + chalk.dim(`  ${address} (chain: ${SIGNING_KEY_CHAIN})`));

  // 3. Create a vault for third-party secrets and let the agent read it.
  const vaultId = await createVault(bootstrapConfig, profile.vaultName);
  await grantAgentRead(bootstrapConfig, vaultId, agentId);
  console.log(chalk.green('✓ vault + read policy') + chalk.dim(`  ${profile.vaultName}  ${vaultId}`));

  // 4. Store third-party secrets in the vault (Bankr required; others optional).
  const storedNames: string[] = [];
  console.log(chalk.cyan('\nstoring secrets in the 1Claw vault:'));
  console.log(chalk.dim('  third-party keys live in the vault — they are cleared from .env after bootstrap.\n'));

  const vaultValues = new Map<string, string>([['bankr_api_key', bankrKey]]);

  for (const secret of VAULT_SECRETS) {
    if (secret.vaultName === 'bankr_api_key') continue; // already collected above

    let value = String(config[secret.configKey] ?? '').trim();
    if (!value && interactive) {
      value = await promptSecret(chalk.cyan(`  ${secret.prompt}: `));
    }
    if (!value) {
      if (secret.required) {
        throw new Error(`${secret.configKey} is required`);
      }
      continue;
    }
    vaultValues.set(secret.vaultName, value);
  }

  for (const [vaultName, value] of vaultValues) {
    await putSecret(bootstrapConfig, vaultId, vaultName, value);
    console.log(chalk.green(`    ✓ stored ${vaultName} in vault`));
    storedNames.push(vaultName);
  }

  // 5. Persist agent credentials; scrub vault-held secrets from .env.
  const envPath = resolve(process.cwd(), '.env');
  upsertEnv(envPath, {
    ONECLAW_AGENT_ID: agentId,
    ONECLAW_AGENT_API_KEY: agentApiKey,
    ONECLAW_VAULT_ID: vaultId,
    ONECLAW_AGENT_NAME: profile.agentName,
    ONECLAW_VAULT_NAME: profile.vaultName,
    BANKR_TOKEN_SYMBOL: profile.tokenSymbol,
    BANKR_TOKEN_NAME: profile.tokenName,
  });
  clearEnvKeys(
    envPath,
    VAULT_SECRETS.map((s) => s.configKey as string),
  );

  console.log(chalk.green.bold('\n✓ bootstrap complete'));
  console.log(`  ${chalk.dim('agent key + id + vault written to')} ${envPath}`);
  console.log(`  ${chalk.dim('secrets stored in vault:')} ${storedNames.join(', ')}`);
  console.log(chalk.dim('  vault secrets cleared from .env — `pnpm agent` pulls them at runtime'));
  console.log(chalk.cyan('\nnext: pnpm agent\n'));
}

main().catch((err) => {
  console.error(chalk.red(`bootstrap failed: ${err instanceof Error ? err.message : String(err)}`));
  process.exit(1);
});
