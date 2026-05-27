// 1Claw runtime client — uses @1claw/sdk for JWT auth, vault reads, and Intents.

import { getRuntimeClient, throwOnError } from './oneclaw-sdk.js';
import type { AgentSelfResponse, SecretResponse, TransactionResponse } from '@1claw/sdk';
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

// 1Claw returns either raw base64-encoded 32-byte Ed25519 pubkey, or the full
// OpenSSH line ("ssh-ed25519 AAAA... [comment]").
function rawEd25519FromSsh(sshKey: string): Uint8Array {
  const trimmed = sshKey.trim();
  if (!trimmed) {
    throw new Error('[step 1] 1claw: missing ssh_public_key');
  }

  if (!trimmed.includes(' ')) {
    const raw = Buffer.from(trimmed, 'base64');
    if (raw.length !== 32) {
      throw new Error(`[step 1] 1claw: expected 32-byte Ed25519 key, got ${raw.length} bytes`);
    }
    return Uint8Array.from(raw);
  }

  const blob = Buffer.from(trimmed.split(/\s+/)[1] ?? '', 'base64');
  let off = 0;
  const readLen = () => {
    const n = blob.readUInt32BE(off);
    off += 4;
    return n;
  };
  const typeLen = readLen();
  const type = blob.subarray(off, off + typeLen).toString('ascii');
  off += typeLen;
  if (type !== 'ssh-ed25519') {
    throw new Error(`[step 1] 1claw: expected ssh-ed25519 key, got ${type || '(unknown)'}`);
  }
  const keyLen = readLen();
  const pubkey = blob.subarray(off, off + keyLen);
  if (pubkey.length !== 32) {
    throw new Error(`[step 1] 1claw: invalid Ed25519 public key length (${pubkey.length})`);
  }
  return Uint8Array.from(pubkey);
}

export async function getAgentIdentity(config: Config): Promise<AgentIdentity> {
  if (!config.ONECLAW_AGENT_API_KEY) {
    throw new Error('[step 1] 1claw: ONECLAW_AGENT_API_KEY is required — run `pnpm bootstrap` first');
  }

  const me = throwOnError<AgentSelfResponse>('[step 1] 1claw agents/me', await getRuntimeClient(config).agents.getSelf());
  return { agentId: me.id, publicKey: rawEd25519FromSsh(me.ssh_public_key) };
}

export async function getSecret(config: Config, path: string): Promise<string | undefined> {
  if (!config.ONECLAW_AGENT_API_KEY || !config.ONECLAW_VAULT_ID) return undefined;

  const res = await getRuntimeClient(config).secrets.get(config.ONECLAW_VAULT_ID, path);
  if (res.meta?.status === 404) return undefined;
  const data = throwOnError<SecretResponse>(`1claw vault read ${path}`, res);
  return data.value;
}

export async function submitIntent(config: Config, body: IntentRequest): Promise<{ txHash: string }> {
  if (!config.ONECLAW_AGENT_API_KEY) {
    throw new Error('[step 5] 1claw intents: ONECLAW_AGENT_API_KEY is required — run `pnpm bootstrap` first');
  }
  if (!config.ONECLAW_AGENT_ID) {
    throw new Error('[step 5] 1claw intents: ONECLAW_AGENT_ID is required (intents are agent-scoped)');
  }

  const client = getRuntimeClient(config);
  let tx = throwOnError<TransactionResponse>(
    '[step 5] 1claw intent submit',
    await client.agents.submitTransaction(config.ONECLAW_AGENT_ID, {
      chain: body.chain,
      to: body.to,
      value: body.value,
      data: body.data,
    }),
  );

  for (let i = 0; !tx.tx_hash && i < 10 && tx.status !== 'failed'; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    tx = throwOnError<TransactionResponse>(
      '[step 5] 1claw tx poll',
      await client.agents.getTransaction(config.ONECLAW_AGENT_ID, tx.id),
    );
  }
  if (!tx.tx_hash) throw new Error(`[step 5] 1claw intent: no tx_hash (status: ${tx.status})`);
  return { txHash: tx.tx_hash };
}
