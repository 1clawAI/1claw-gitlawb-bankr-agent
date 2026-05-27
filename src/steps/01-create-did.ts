// Step 1/5 — read the agent's auto-provisioned Ed25519 identity key from 1Claw
// and encode its public key as a did:key. The agent already has this keypair
// (private half in the HSM); we just derive the DID from the public key.

import { getAgentIdentity } from '../clients/oneclaw.js';
import * as log from '../logger.js';
import type { Config } from '../config.js';
import type { AgentContext, StepResult } from '../types.js';

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// Minimal base58btc encoder (multibase 'z' prefix) — keeps did:key encoding
// self-contained without pulling in a heavier multibase dependency.
function base58btc(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits: number[] = [];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = BASE58_ALPHABET[0].repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i--) out += BASE58_ALPHABET[digits[i]];
  return out;
}

// did:key for Ed25519 = "did:key:z" + base58btc(0xed01 multicodec prefix || pubkey).
function encodeDidKey(publicKey: Uint8Array): string {
  const prefixed = new Uint8Array(publicKey.length + 2);
  prefixed[0] = 0xed;
  prefixed[1] = 0x01;
  prefixed.set(publicKey, 2);
  return `did:key:z${base58btc(prefixed)}`;
}

export async function createDid(_ctx: AgentContext, config: Config): Promise<StepResult> {
  const { agentId, publicKey } = await getAgentIdentity(config);
  const did = encodeDidKey(publicKey);
  log.detail('agent', agentId);
  log.detail('did', did);

  return {
    patch: { did, keyId: agentId, publicKey: Buffer.from(publicKey).toString('hex') },
    done: did,
  };
}
