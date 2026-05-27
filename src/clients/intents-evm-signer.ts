// EVM signer backed by the agent's HSM-held key via POST /v1/agents/{id}/sign.
// Used for x402 micropayments when vault reads return 402.

import { createPublicClient, http, type PublicClient } from 'viem';
import { base } from 'viem/chains';
import { toClientEvmSigner, type ClientEvmSigner } from '@x402/evm';
import type { Config } from '../config.js';

const bearer = (config: Config) => ({
  'content-type': 'application/json',
  authorization: `Bearer ${config.ONECLAW_AGENT_API_KEY}`,
});

async function getSigningAddress(config: Config): Promise<`0x${string}`> {
  if (!config.ONECLAW_AGENT_ID) {
    throw new Error('ONECLAW_AGENT_ID is required for x402 payments');
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

export async function createIntentsEvmSigner(config: Config): Promise<ClientEvmSigner> {
  const address = await getSigningAddress(config);
  const publicClient = createPublicClient({
    chain: base,
    transport: http(config.BASE_RPC_URL),
  }) as PublicClient;

  const account = {
    address,
    async signTypedData(message: {
      domain: Record<string, unknown>;
      types: Record<string, unknown>;
      primaryType: string;
      message: Record<string, unknown>;
    }): Promise<`0x${string}`> {
      const res = await fetch(`${config.ONECLAW_API_URL}/v1/agents/${config.ONECLAW_AGENT_ID}/sign`, {
        method: 'POST',
        headers: bearer(config),
        body: JSON.stringify({
          intent_type: 'typed_data',
          chain: 'base',
          typed_data: message,
        }),
      });
      if (!res.ok) {
        throw new Error(`1claw typed_data sign failed: ${res.status} ${await res.text()}`);
      }
      const json = (await res.json()) as { signature?: string };
      if (!json.signature) throw new Error('1claw typed_data sign returned no signature');
      return json.signature as `0x${string}`;
    },
  };

  return toClientEvmSigner(account, publicClient);
}
