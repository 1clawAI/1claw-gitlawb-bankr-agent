// Bootstrap profile fields — agent/vault names and Bankr token metadata.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import chalk from 'chalk';
import type { Config } from './config.js';
import { promptLine } from './util/prompt-line.js';

const RESOURCE_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const TOKEN_SYMBOL_RE = /^[A-Z0-9]{1,10}$/;

export interface BootstrapProfile {
  agentName: string;
  vaultName: string;
  tokenSymbol: string;
  tokenName: string;
  tokenImage: string;
}

function validateResourceName(label: string, value: string): string {
  if (!RESOURCE_NAME_RE.test(value)) {
    throw new Error(
      `${label} must be 1–64 characters: letters, numbers, hyphens, underscores; must start with alphanumeric`,
    );
  }
  return value;
}

function validateTokenSymbol(value: string): string {
  const upper = value.toUpperCase();
  if (!TOKEN_SYMBOL_RE.test(upper)) {
    throw new Error('token ticker must be 1–10 uppercase letters or numbers (e.g. AGENT, CLAW1)');
  }
  return upper;
}

function defaultVaultName(agentName: string): string {
  return `${agentName}-secrets`;
}

function resolveLocalImageToUrl(value: string): string | undefined {
  const rel = value.startsWith('./') || value.startsWith('../') || !value.includes('://');
  if (!rel) return undefined;
  const abs = resolve(process.cwd(), value);
  if (!existsSync(abs)) {
    throw new Error(`token image file not found: ${abs}`);
  }
  let remote = '';
  try {
    remote = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
  } catch { /* not a git repo */ }

  const ghMatch = remote.match(/github\.com[/:](.+?)(?:\.git)?$/);
  if (!ghMatch) {
    throw new Error(
      `token image is a local file (${value}) but cannot build a public URL — ` +
      `push to GitHub first or use an https:// hosted URL`,
    );
  }

  let branch = 'main';
  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
  } catch { /* fallback to main */ }

  const repoPath = ghMatch[1];
  const filePath = value.replace(/^\.\//, '');
  return `https://raw.githubusercontent.com/${repoPath}/${branch}/${filePath}`;
}

function validateTokenImageUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const localUrl = resolveLocalImageToUrl(trimmed);
  if (localUrl) return localUrl;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('token image must be a valid URL or a local file path (e.g. ./assets/logo.png)');
  }
  if (url.protocol !== 'https:') {
    throw new Error('token image URL must use https');
  }
  return trimmed;
}

async function resolveOptionalImageUrl(envValue: string, interactive: boolean): Promise<string> {
  const fromEnv = envValue.trim();
  if (fromEnv) return validateTokenImageUrl(fromEnv);
  if (!interactive) return '';

  for (;;) {
    const raw = await promptLine(
      chalk.cyan('  Token image (square PNG/JPG, https URL or local path e.g. ./assets/logo.png)'),
      '',
    );
    if (!raw.trim()) return '';
    try {
      return validateTokenImageUrl(raw);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(chalk.yellow(`    ✗ ${msg}`));
    }
  }
}

async function resolveSetting(
  label: string,
  envValue: string,
  defaultValue: string,
  interactive: boolean,
  validate: (value: string) => string,
): Promise<string> {
  const fromEnv = envValue.trim();
  if (fromEnv) return validate(fromEnv);

  if (!interactive) return validate(defaultValue);

  for (;;) {
    const raw = await promptLine(chalk.cyan(`  ${label}`), defaultValue);
    try {
      return validate(raw);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(chalk.yellow(`    ✗ ${msg}`));
    }
  }
}

export async function resolveBootstrapProfile(config: Config, interactive: boolean): Promise<BootstrapProfile> {
  const agentDefault = config.ONECLAW_AGENT_NAME || 'reference-agent';
  const agentName = await resolveSetting(
    '1Claw agent name',
    config.ONECLAW_AGENT_NAME,
    agentDefault,
    interactive,
    (v) => validateResourceName('agent name', v),
  );

  const vaultDefault = config.ONECLAW_VAULT_NAME.trim() || defaultVaultName(agentName);
  const vaultName = await resolveSetting(
    '1Claw vault name (third-party secrets)',
    config.ONECLAW_VAULT_NAME,
    vaultDefault,
    interactive,
    (v) => validateResourceName('vault name', v),
  );

  const symbolDefault = config.BANKR_TOKEN_SYMBOL || 'AGENT';
  const tokenSymbol = await resolveSetting(
    'Bankr token ticker',
    config.BANKR_TOKEN_SYMBOL,
    symbolDefault,
    interactive,
    validateTokenSymbol,
  );

  const tokenNameDefault = config.BANKR_TOKEN_NAME.trim();
  let tokenName = config.BANKR_TOKEN_NAME.trim();
  if (!tokenName && interactive) {
    tokenName = (
      await promptLine(
        chalk.cyan('  Bankr token name (optional — Enter uses "Agent <id>" at deploy)'),
        tokenNameDefault,
      )
    ).trim();
  }

  const tokenImage = await resolveOptionalImageUrl(config.BANKR_TOKEN_IMAGE, interactive);

  return { agentName, vaultName, tokenSymbol, tokenName, tokenImage };
}
