// 1Claw client — HSM-backed key vault (step 1) and Intents signing API (step 5).
// The private key is POSTed once to the vault and never returned or logged again.

import { withTimeout, DEFAULT_TIMEOUT_MS } from '../util/timeout.js';
import * as log from '../logger.js';
import type { Config } from '../config.js';

export interface StoreKeyRequest {
  privateKey: string;
  label: string;
}

export interface IntentRequest {
  keyId: string;
  chainId: number;
  to: string;
  data: string;
  value: string;
}

// Store an Ed25519 private key in the vault, get back an opaque key handle.
export async function storeKey(config: Config, body: StoreKeyRequest): Promise<{ keyId: string }> {
  if (!config.ONECLAW_API_KEY) {
    log.stub('1claw vault — no ONECLAW_API_KEY, returning mock keyId');
    return { keyId: `key_stub_${Date.now().toString(36)}` };
  }

  // TODO(spec): confirm endpoint shape — POST /v1/vault/keys { algorithm, privateKey, label } -> { keyId }
  return withTimeout('1claw vault store', DEFAULT_TIMEOUT_MS, async (signal) => {
    const res = await fetch(`${config.ONECLAW_API_URL}/v1/vault/keys`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.ONECLAW_API_KEY}`,
      },
      body: JSON.stringify({ algorithm: 'ed25519', privateKey: body.privateKey, label: body.label }),
      signal,
    });
    if (!res.ok) {
      throw new Error(`[step 1] 1claw vault store failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as { keyId: string };
  });
}

// Submit a signing Intent. 1Claw's HSM signs with the vaulted key and broadcasts.
export async function submitIntent(config: Config, body: IntentRequest): Promise<{ txHash: string }> {
  if (!config.ONECLAW_API_KEY) {
    log.stub('1claw intents — no ONECLAW_API_KEY, returning mock txHash');
    return { txHash: `0x${'ab'.repeat(32)}` };
  }

  // TODO(spec): confirm endpoint shape — POST /v1/intents { keyId, chainId, to, data, value } -> { txHash }
  return withTimeout('1claw intent submit', DEFAULT_TIMEOUT_MS, async (signal) => {
    const res = await fetch(`${config.ONECLAW_API_URL}/v1/intents`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.ONECLAW_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      throw new Error(`[step 5] 1claw intent submit failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as { txHash: string };
  });
}
