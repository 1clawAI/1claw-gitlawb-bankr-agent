// 1Claw runtime client — used by `pnpm agent` with the AGENT key (ocv_…), which
// is a valid Bearer token. Reads the agent's Ed25519 identity key (for the DID,
// step 1), reads third-party secrets from the vault (src/secrets.ts), and submits
// signing Intents (step 5). Signing keys live in the HSM; nothing private leaves.

import { randomUUID } from 'node:crypto';
import { withTimeout, DEFAULT_TIMEOUT_MS } from '../util/timeout.js';
import type { Config } from '../config.js';

export interface AgentIdentity {
  agentId: string;
  publicKey: Uint8Array; // 32-byte Ed25519 identity public key
}

export interface IntentRequest {
  chain: string; // e.g. "base"
  to: string;
  data: string;
  value: string; // wei
}

const bearer = (config: Config) => ({
  'content-type': 'application/json',
  authorization: `Bearer ${config.ONECLAW_AGENT_API_KEY}`,
});

// The raw Ed25519 key is the trailing 32 bytes of the SSH wire-format blob
// ("ssh-ed25519 <base64> [comment]").
function rawEd25519FromSsh(sshKey: string): Uint8Array {
  const blob = Buffer.from(sshKey.trim().split(/\s+/)[1] ?? '', 'base64');
  return Uint8Array.from(blob.subarray(blob.length - 32));
}

// Read the agent's auto-provisioned identity key from GET /v1/agents/me.
// The agent already has an Ed25519 keypair, so the DID is derived, not minted.
export async function getAgentIdentity(config: Config): Promise<AgentIdentity> {
  if (!config.ONECLAW_AGENT_API_KEY) {
    throw new Error('[step 1] 1claw: ONECLAW_AGENT_API_KEY is required — run `pnpm bootstrap` first');
  }

  return withTimeout('1claw agents/me', DEFAULT_TIMEOUT_MS, async (signal) => {
    const res = await fetch(`${config.ONECLAW_API_URL}/v1/agents/me`, { headers: bearer(config), signal });
    if (!res.ok) throw new Error(`[step 1] 1claw agents/me failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { id: string; ssh_public_key: string };
    return { agentId: json.id, publicKey: rawEd25519FromSsh(json.ssh_public_key) };
  });
}

// Read a secret the bootstrap stored in the vault. Returns undefined when the
// agent isn't provisioned or the secret is absent (caller falls back to env).
export async function getSecret(config: Config, path: string): Promise<string | undefined> {
  if (!config.ONECLAW_AGENT_API_KEY || !config.ONECLAW_VAULT_ID) return undefined;

  return withTimeout(`1claw vault read ${path}`, DEFAULT_TIMEOUT_MS, async (signal) => {
    const res = await fetch(
      `${config.ONECLAW_API_URL}/v1/vaults/${config.ONECLAW_VAULT_ID}/secrets/${encodeURIComponent(path)}`,
      { headers: bearer(config), signal },
    );
    if (res.status === 404) return undefined;
    if (!res.ok) throw new Error(`1claw vault read ${path} failed: ${res.status} ${await res.text()}`);
    return ((await res.json()) as { value?: string }).value;
  });
}

// Submit a transaction Intent. The HSM signs with the agent's Base signing key
// and broadcasts; we poll until a tx hash appears.
export async function submitIntent(config: Config, body: IntentRequest): Promise<{ txHash: string }> {
  if (!config.ONECLAW_AGENT_API_KEY) {
    throw new Error('[step 5] 1claw intents: ONECLAW_AGENT_API_KEY is required — run `pnpm bootstrap` first');
  }
  if (!config.ONECLAW_AGENT_ID) {
    throw new Error('[step 5] 1claw intents: ONECLAW_AGENT_ID is required (intents are agent-scoped)');
  }
  const base = `${config.ONECLAW_API_URL}/v1/agents/${config.ONECLAW_AGENT_ID}/transactions`;

  return withTimeout('1claw intent submit', DEFAULT_TIMEOUT_MS, async (signal) => {
    const res = await fetch(base, {
      method: 'POST',
      headers: { ...bearer(config), 'Idempotency-Key': randomUUID() },
      body: JSON.stringify({ chain: body.chain, to: body.to, value: body.value, data: body.data }),
      signal,
    });
    if (!res.ok) throw new Error(`[step 5] 1claw intent submit failed: ${res.status} ${await res.text()}`);
    let tx = (await res.json()) as { id: string; tx_hash?: string; status: string };

    // Broadcast is async; poll the transaction until it has a hash.
    for (let i = 0; !tx.tx_hash && i < 10 && tx.status !== 'failed'; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const poll = await fetch(`${base}/${tx.id}`, { headers: bearer(config), signal });
      if (!poll.ok) throw new Error(`[step 5] 1claw tx poll failed: ${poll.status} ${await poll.text()}`);
      tx = (await poll.json()) as { id: string; tx_hash?: string; status: string };
    }
    if (!tx.tx_hash) throw new Error(`[step 5] 1claw intent: no tx_hash (status: ${tx.status})`);
    return { txHash: tx.tx_hash };
  });
}
