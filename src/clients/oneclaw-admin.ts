// 1Claw admin client — used by `pnpm bootstrap` with the HUMAN key (1ck_…).
// Provisions the agent (which gets its own ocv_ key), a secrets vault, a read
// policy, and a Base signing key, then writes third-party secrets into the vault.
// (Multi-tenant platforms can do all of this in one call via the Platform
// bootstrap-from-template endpoint; here we use the direct human-key flow.)

import { withTimeout, DEFAULT_TIMEOUT_MS } from '../util/timeout.js';
import type { Config } from '../config.js';

export interface ProvisionedAgent {
  agentId: string;
  agentApiKey: string;
}

const human = (config: Config) => ({
  'content-type': 'application/json',
  authorization: `Bearer ${config.ONECLAW_HUMAN_API_KEY}`,
});

function requireHumanKey(config: Config): void {
  if (!config.ONECLAW_HUMAN_API_KEY) {
    throw new Error('ONECLAW_HUMAN_API_KEY is required — set your 1ck_… key in .env');
  }
}

async function post(config: Config, path: string, body: unknown, label: string): Promise<any> {
  return withTimeout(label, DEFAULT_TIMEOUT_MS, async (signal) => {
    const res = await fetch(`${config.ONECLAW_API_URL}${path}`, {
      method: 'POST',
      headers: human(config),
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) throw new Error(`${label} failed: ${res.status} ${await res.text()}`);
    return res.json();
  });
}

// Create an agent with Base intents enabled; returns its own scoped key.
export async function createAgent(config: Config, name: string): Promise<ProvisionedAgent> {
  requireHumanKey(config);
  // Guardrails are fields on the agent record (not a separate policy).
  const json = await post(
    config,
    '/v1/agents',
    {
      name,
      intents_api_enabled: true,
      shroud_enabled: true,
      tx_allowed_chains: ['base'],
      tx_max_value_eth: '0', // contract calls only, no native value
    },
    '1claw create agent',
  );
  return { agentId: json.agent.id, agentApiKey: json.api_key };
}

// Create a vault to hold the agent's third-party secrets; returns its id.
export async function createVault(config: Config, name: string): Promise<string> {
  requireHumanKey(config);
  const json = await post(config, '/v1/vaults', { name }, '1claw create vault');
  return json.id ?? json.vault?.id;
}

// Let the agent read every secret in the vault.
export async function grantAgentRead(config: Config, vaultId: string, agentId: string): Promise<void> {
  requireHumanKey(config);
  await post(
    config,
    `/v1/vaults/${vaultId}/policies`,
    { principal_type: 'agent', principal_id: agentId, secret_path_pattern: '*', permissions: ['read'] },
    '1claw grant policy',
  );
}

// Provision the agent's signing key for a chain (the HSM holds the private key).
export async function provisionSigningKey(config: Config, agentId: string, chain: string): Promise<string> {
  requireHumanKey(config);
  const json = await post(config, `/v1/agents/${agentId}/signing-keys`, { chain }, '1claw signing key');
  return json.address;
}

// Store a third-party secret in the vault by path.
export async function putSecret(config: Config, vaultId: string, path: string, value: string): Promise<void> {
  requireHumanKey(config);
  await withTimeout(`1claw put secret ${path}`, DEFAULT_TIMEOUT_MS, async (signal) => {
    const res = await fetch(
      `${config.ONECLAW_API_URL}/v1/vaults/${vaultId}/secrets/${encodeURIComponent(path)}`,
      { method: 'PUT', headers: human(config), body: JSON.stringify({ type: 'api_key', value }), signal },
    );
    if (!res.ok) throw new Error(`1claw put secret ${path} failed: ${res.status} ${await res.text()}`);
  });
}
