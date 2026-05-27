// The single source of truth for which third-party secrets live in the 1Claw
// vault. Used by `pnpm bootstrap` to prompt for + store them, and by `pnpm agent`
// to pull them back at runtime — so step code just reads config and never cares
// whether a value came from the vault or a local .env override.

import { getSecret } from './clients/oneclaw.js';
import * as log from './logger.js';
import type { Config } from './config.js';

export interface VaultSecret {
  vaultName: string; // key in the 1Claw vault
  configKey: keyof Config; // bootstrap input / runtime config field
  prompt: string; // shown during bootstrap
  required?: boolean; // fail bootstrap if not provided
}

export const VAULT_SECRETS: VaultSecret[] = [
  {
    vaultName: 'bankr_api_key',
    configKey: 'BANKR_API_KEY',
    prompt: 'Bankr API key (bk_…, read-write + Token Launch) — stored in the 1Claw vault, not .env',
    required: true,
  },
  { vaultName: 'neynar_api_key', configKey: 'NEYNAR_API_KEY', prompt: 'Neynar API key (Farcaster fallback, optional)' },
  { vaultName: 'neynar_signer_uuid', configKey: 'NEYNAR_SIGNER_UUID', prompt: 'Neynar signer UUID (optional)' },
];

// Overlay vault-held secrets onto the config. A value already set in the env wins
// (handy for local overrides); otherwise we fetch it from the vault by name.
// Shroud reuses the agent's own 1Claw key, so no separate secret is needed there.
export async function resolveSecrets(config: Config): Promise<Config> {
  const resolved: Config = { ...config };
  if (!config.ONECLAW_AGENT_API_KEY || !config.ONECLAW_VAULT_ID) return resolved;

  let pulled = 0;
  for (const secret of VAULT_SECRETS) {
    if (resolved[secret.configKey]) continue; // env override present
    const value = await getSecret(config, secret.vaultName);
    if (value) {
      (resolved[secret.configKey] as string) = value;
      pulled++;
    }
  }
  if (pulled > 0) log.detail('vault', `pulled ${pulled} secret(s) from 1Claw`);
  return resolved;
}
