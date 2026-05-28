// Agent EVM wallet on Base — address from 1Claw signing keys + viem public client.

import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import type { Config } from '../config.js';

const bearer = (config: Config) => ({
  'content-type': 'application/json',
  authorization: `Bearer ${config.ONECLAW_AGENT_API_KEY}`,
});

export async function getSigningAddress(config: Config): Promise<`0x${string}`> {
  if (!config.ONECLAW_AGENT_ID) {
    throw new Error('ONECLAW_AGENT_ID is required — run `pnpm bootstrap` first');
  }
  const res = await fetch(`${config.ONECLAW_API_URL}/v1/agents/${config.ONECLAW_AGENT_ID}/signing-keys`, {
    headers: bearer(config),
  });
  if (!res.ok) {
    throw new Error(`1claw signing-keys list failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { keys?: Array<{ chain: string; address?: string; is_active?: boolean }> };
  const key = json.keys?.find((k) => k.is_active !== false && k.chain === 'ethereum') ?? json.keys?.[0];
  if (!key?.address) {
    throw new Error('no EVM signing key found — re-run `pnpm bootstrap` to provision one');
  }
  return key.address as `0x${string}`;
}

export function getBasePublicClient(config: Config) {
  return createPublicClient({
    chain: base,
    transport: http(config.BASE_RPC_URL),
  });
}
