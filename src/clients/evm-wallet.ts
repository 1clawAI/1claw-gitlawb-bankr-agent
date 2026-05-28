// Agent EVM wallet on Base — address from 1Claw signing keys + viem public client.

import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import type { SigningKeyListResponse, SigningKeyResponse } from '@1claw/sdk';
import type { Config } from '../config.js';
import { getRuntimeClient, throwOnError } from './oneclaw-sdk.js';

export async function getSigningAddress(config: Config): Promise<`0x${string}`> {
  if (!config.ONECLAW_AGENT_ID) {
    throw new Error('ONECLAW_AGENT_ID is required — run `pnpm bootstrap` first');
  }
  if (!config.ONECLAW_AGENT_API_KEY) {
    throw new Error('ONECLAW_AGENT_API_KEY is required — run `pnpm bootstrap` first');
  }

  const list = throwOnError<SigningKeyListResponse>(
    '1claw signing-keys list',
    await getRuntimeClient(config).signingKeys.list(config.ONECLAW_AGENT_ID),
  );
  const key =
    list.keys.find((k: SigningKeyResponse) => k.is_active !== false && k.chain === 'ethereum') ??
    list.keys[0];
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
