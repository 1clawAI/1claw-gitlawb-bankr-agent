// EVM signer backed by the agent's HSM-held key via POST /v1/agents/{id}/sign.
// Used for x402 micropayments when vault reads return 402.

import { toClientEvmSigner, type ClientEvmSigner } from '@x402/evm';
import type { Config } from '../config.js';
import { getBasePublicClient, getSigningAddress } from './evm-wallet.js';

const bearer = (config: Config) => ({
  'content-type': 'application/json',
  authorization: `Bearer ${config.ONECLAW_AGENT_API_KEY}`,
});

export async function createIntentsEvmSigner(config: Config): Promise<ClientEvmSigner> {
  const address = await getSigningAddress(config);
  const publicClient = getBasePublicClient(config);

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
