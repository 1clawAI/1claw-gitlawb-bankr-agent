// Factory for configured @1claw/sdk clients — JWT auth + automatic x402 retry.

import {
  createClient,
  type OneclawClient,
  type OneclawResponse,
  type PaymentAccept,
  type X402Signer,
} from '@1claw/sdk';
import { x402Client } from '@x402/core/client';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import type { Config } from '../config.js';
import { createIntentsEvmSigner } from './intents-evm-signer.js';

const MAX_AUTO_PAY_USD = 0.05;

export function throwOnError<T>(label: string, res: OneclawResponse<T>): T {
  if (res.error) throw new Error(`${label}: ${res.error.message}`);
  if (res.data == null) throw new Error(`${label}: empty response`);
  return res.data;
}

function createIntentsX402Signer(config: Config): X402Signer {
  let evmSignerPromise: ReturnType<typeof createIntentsEvmSigner> | undefined;
  let paymentClient: x402Client | undefined;

  const evmSigner = () => {
    evmSignerPromise ??= createIntentsEvmSigner(config);
    return evmSignerPromise;
  };

  const paymentClientReady = async () => {
    if (!paymentClient) {
      paymentClient = new x402Client();
      registerExactEvmScheme(paymentClient, { signer: await evmSigner() });
    }
    return paymentClient;
  };

  return {
    getAddress: async () => (await evmSigner()).address,
    signPayment: async (accept: PaymentAccept) => {
      const client = await paymentClientReady();
      const payload = await client.createPaymentPayload({
        x402Version: 1,
        accepts: [accept],
      } as Parameters<x402Client['createPaymentPayload']>[0]);
      return typeof payload.payload === 'string' ? payload.payload : JSON.stringify(payload.payload);
    },
  };
}

let runtimeClient: OneclawClient | undefined;
let adminClient: OneclawClient | undefined;
let adminAuthPromise: Promise<void> | undefined;

/** Runtime agent client — exchanges ocv_ for JWT, auto-pays x402 overages via HSM key. */
export function getRuntimeClient(config: Config): OneclawClient {
  runtimeClient ??= createClient({
    baseUrl: config.ONECLAW_API_URL,
    apiKey: config.ONECLAW_AGENT_API_KEY,
    agentId: config.ONECLAW_AGENT_ID,
    x402Signer: createIntentsX402Signer(config),
    maxAutoPayUsd: MAX_AUTO_PAY_USD,
  });
  return runtimeClient;
}

/** Bootstrap admin client — exchanges 1ck_ for JWT before returning. */
export async function getAdminClient(config: Config): Promise<OneclawClient> {
  if (!config.ONECLAW_HUMAN_API_KEY) {
    throw new Error('ONECLAW_HUMAN_API_KEY is required');
  }
  adminClient ??= createClient({
    baseUrl: config.ONECLAW_API_URL,
    apiKey: config.ONECLAW_HUMAN_API_KEY,
    maxAutoPayUsd: MAX_AUTO_PAY_USD,
  });
  // SDK auto-auth for 1ck_ keys is fire-and-forget; await explicit exchange so the
  // first admin call (create agent) always has Authorization: Bearer …
  const apiKey = config.ONECLAW_HUMAN_API_KEY;
  adminAuthPromise ??= (async () => {
    throwOnError('1claw authenticate', await adminClient!.auth.apiKeyToken({ api_key: apiKey }));
  })();
  await adminAuthPromise;
  return adminClient;
}

/** Reset cached clients (tests or config hot-reload). */
export function resetClients(): void {
  runtimeClient = undefined;
  adminClient = undefined;
  adminAuthPromise = undefined;
}
