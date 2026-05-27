// 1Claw client — HSM-backed key vault (step 1) and Intents signing API (step 5).
// Per docs.1claw.xyz keys are generated *inside* the HSM/KMS and only the public
// half ever leaves, so we ask the vault to mint an Ed25519 key and get back a
// keyId + public key — the private key never exists on this machine.

import * as ed from '@noble/ed25519';
import { withTimeout, DEFAULT_TIMEOUT_MS } from '../util/timeout.js';
import * as log from '../logger.js';
import type { Config } from '../config.js';

export interface GeneratedKey {
  keyId: string;
  publicKey: Uint8Array; // 32-byte Ed25519 public key
}

export interface IntentRequest {
  keyId: string;
  chainId: number;
  to: string;
  data: string;
  value: string;
}

// Mint an Ed25519 key in the vault. The stub generates locally so the scaffold
// still produces a real did:key offline; the private key is discarded immediately.
export async function generateKey(config: Config): Promise<GeneratedKey> {
  if (!config.ONECLAW_API_KEY) {
    log.stub('1claw vault — no ONECLAW_API_KEY, generating key locally (HSM does this in prod)');
    const privateKey = ed.utils.randomPrivateKey();
    const publicKey = await ed.getPublicKeyAsync(privateKey);
    return { keyId: `key_stub_${Date.now().toString(36)}`, publicKey };
  }

  // TODO(spec): confirm endpoint shape — POST /v1/vault/keys { algorithm: "ed25519" }
  // -> { keyId, publicKey }. The vault generates the key; we never send a private key.
  return withTimeout('1claw vault generate', DEFAULT_TIMEOUT_MS, async (signal) => {
    const res = await fetch(`${config.ONECLAW_API_URL}/v1/vault/keys`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.ONECLAW_API_KEY}`,
      },
      body: JSON.stringify({ algorithm: 'ed25519', label: 'agent-did-key' }),
      signal,
    });
    if (!res.ok) {
      throw new Error(`[step 1] 1claw vault generate failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { keyId: string; publicKey: string };
    // TODO(spec): confirm publicKey encoding (assuming hex); convert to bytes.
    return { keyId: json.keyId, publicKey: Uint8Array.from(Buffer.from(json.publicKey, 'hex')) };
  });
}

// Submit a signing Intent. 1Claw's HSM signs with the vaulted key and broadcasts.
export async function submitIntent(config: Config, body: IntentRequest): Promise<{ txHash: string }> {
  if (!config.ONECLAW_API_KEY) {
    log.stub('1claw intents — no ONECLAW_API_KEY, returning mock txHash');
    return { txHash: `0x${'ab'.repeat(32)}` };
  }
  if (!config.ONECLAW_AGENT_ID) {
    throw new Error('[step 5] 1claw intents: ONECLAW_AGENT_ID is required (intents are agent-scoped)');
  }

  // TODO(spec): confirm endpoint + field names. Docs reference
  // POST /v1/agents/:id/transactions with { chain, recipient, value, signing key }.
  // Reconciling to { chainId, to, data, value, keyId } here — verify the exact shape.
  return withTimeout('1claw intent submit', DEFAULT_TIMEOUT_MS, async (signal) => {
    const res = await fetch(`${config.ONECLAW_API_URL}/v1/agents/${config.ONECLAW_AGENT_ID}/transactions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.ONECLAW_API_KEY}`,
      },
      body: JSON.stringify({
        keyId: body.keyId,
        chainId: body.chainId,
        to: body.to,
        data: body.data,
        value: body.value,
      }),
      signal,
    });
    if (!res.ok) {
      throw new Error(`[step 5] 1claw intent submit failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { txHash?: string; hash?: string };
    const txHash = json.txHash ?? json.hash;
    if (!txHash) throw new Error('[step 5] 1claw intent submit: no txHash in response');
    return { txHash };
  });
}
