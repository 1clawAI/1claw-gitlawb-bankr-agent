// 1Claw admin client — uses @1claw/sdk with the HUMAN key (1ck_…) for bootstrap.

import { getAdminClient, throwOnError } from './oneclaw-sdk.js';
import type { AgentCreatedResponse, SigningKeyResponse, VaultResponse } from '@1claw/sdk';
import type { Config } from '../config.js';

export interface ProvisionedAgent {
  agentId: string;
  agentApiKey: string;
}

// Chain name for HSM signing-key provisioning (EVM — used for Base intents).
export const SIGNING_KEY_CHAIN = 'ethereum';

function requireHumanKey(config: Config): void {
  if (!config.ONECLAW_HUMAN_API_KEY) {
    throw new Error('ONECLAW_HUMAN_API_KEY is required — set your 1ck_… key in .env');
  }
}

export async function createAgent(config: Config, name: string): Promise<ProvisionedAgent> {
  requireHumanKey(config);
  const created = throwOnError<AgentCreatedResponse>(
    '1claw create agent',
    await getAdminClient(config).agents.create({
      name,
      intents_api_enabled: true,
      shroud_enabled: true,
      message_signing_enabled: true,
      eip712_default_policy: 'allow',
      tx_allowed_chains: ['base'],
      tx_max_value_eth: '0',
    }),
  );
  return { agentId: created.agent.id, agentApiKey: created.api_key };
}

export async function createVault(config: Config, name: string): Promise<string> {
  requireHumanKey(config);
  const vault = throwOnError<VaultResponse>('1claw create vault', await getAdminClient(config).vault.create({ name }));
  return vault.id;
}

export async function grantAgentRead(config: Config, vaultId: string, agentId: string): Promise<void> {
  requireHumanKey(config);
  throwOnError(
    '1claw grant policy',
    await getAdminClient(config).access.grantAgent(vaultId, agentId, ['read'], {
      secretPathPattern: '*',
    }),
  );
}

export async function provisionSigningKey(config: Config, agentId: string, chain: string): Promise<string> {
  requireHumanKey(config);
  const key = throwOnError<SigningKeyResponse>(
    '1claw signing key',
    await getAdminClient(config).signingKeys.create(agentId, { chain }),
  );
  if (!key.address) throw new Error('1claw signing key: no address returned');
  return key.address;
}

export async function putSecret(config: Config, vaultId: string, path: string, value: string): Promise<void> {
  requireHumanKey(config);
  throwOnError(
    `1claw put secret ${path}`,
    await getAdminClient(config).secrets.set(vaultId, path, value, { type: 'api_key' }),
  );
}
