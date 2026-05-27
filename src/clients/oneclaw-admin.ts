// 1Claw admin client — used by `pnpm bootstrap` with the HUMAN API key.
// Provisions the agent (which gets its own scoped API key), attaches a policy,
// and writes third-party secrets into the agent's vault. None of this runs at
// agent runtime; the agent only ever sees its own key.

import { withTimeout, DEFAULT_TIMEOUT_MS } from '../util/timeout.js';
import * as log from '../logger.js';
import type { Config } from '../config.js';

export interface ProvisionedAgent {
  agentId: string;
  agentApiKey: string;
}

const humanHeaders = (config: Config) => ({
  'content-type': 'application/json',
  authorization: `Bearer ${config.ONECLAW_HUMAN_API_KEY}`,
});

// Create an agent under the human's account; returns the agent's own scoped key.
export async function createAgent(config: Config, name: string): Promise<ProvisionedAgent> {
  if (!config.ONECLAW_HUMAN_API_KEY) {
    log.stub('1claw admin — no human key, simulating agent provisioning locally');
    return { agentId: `agt_stub_${Date.now().toString(36)}`, agentApiKey: `ak_stub_${Date.now().toString(36)}` };
  }

  // TODO(spec): confirm endpoint — POST /v1/agents { name } -> { agentId, apiKey }.
  return withTimeout('1claw create agent', DEFAULT_TIMEOUT_MS, async (signal) => {
    const res = await fetch(`${config.ONECLAW_API_URL}/v1/agents`, {
      method: 'POST',
      headers: humanHeaders(config),
      body: JSON.stringify({ name }),
      signal,
    });
    if (!res.ok) throw new Error(`1claw create agent failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { agentId?: string; id?: string; apiKey?: string; agentApiKey?: string };
    const agentId = json.agentId ?? json.id;
    const agentApiKey = json.agentApiKey ?? json.apiKey;
    if (!agentId || !agentApiKey) throw new Error('1claw create agent: missing agentId/apiKey in response');
    return { agentId, agentApiKey };
  });
}

// Attach guardrails to the agent (which chains/contracts/spend it may sign for).
export async function attachPolicy(config: Config, agentId: string, policy: unknown): Promise<void> {
  if (!config.ONECLAW_HUMAN_API_KEY) {
    log.stub('1claw admin — no human key, skipping policy attach');
    return;
  }

  // TODO(spec): confirm endpoint — POST /v1/agents/:id/policies (guardrails shape).
  await withTimeout('1claw attach policy', DEFAULT_TIMEOUT_MS, async (signal) => {
    const res = await fetch(`${config.ONECLAW_API_URL}/v1/agents/${agentId}/policies`, {
      method: 'POST',
      headers: humanHeaders(config),
      body: JSON.stringify(policy),
      signal,
    });
    if (!res.ok) throw new Error(`1claw attach policy failed: ${res.status} ${await res.text()}`);
  });
}

// Store a third-party secret in the agent's vault so the agent can read it at runtime.
export async function putSecret(config: Config, agentId: string, name: string, value: string): Promise<void> {
  if (!config.ONECLAW_HUMAN_API_KEY) {
    log.stub(`1claw admin — no human key, not storing "${name}" in vault`);
    return;
  }

  // TODO(spec): confirm endpoint — PUT /v1/agents/:id/vault/secrets/{name} { value }.
  await withTimeout(`1claw put secret ${name}`, DEFAULT_TIMEOUT_MS, async (signal) => {
    const res = await fetch(
      `${config.ONECLAW_API_URL}/v1/agents/${agentId}/vault/secrets/${encodeURIComponent(name)}`,
      { method: 'PUT', headers: humanHeaders(config), body: JSON.stringify({ value }), signal },
    );
    if (!res.ok) throw new Error(`1claw put secret ${name} failed: ${res.status} ${await res.text()}`);
  });
}
