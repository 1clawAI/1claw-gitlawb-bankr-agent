// Step 5/5 — swap a small amount of the launched token -> USDC on Uniswap V4
// (Base) by submitting an Intent to 1Claw. The HSM signs; the key never leaves it.

import { submitIntent } from '../clients/oneclaw.js';
import * as log from '../logger.js';
import type { Config } from '../config.js';
import type { AgentContext, StepResult } from '../types.js';

const BASE_CHAIN_ID = 8453;
// Uniswap V4 UniversalRouter on Base.
// TODO(spec): confirm router address + encode the real swap calldata
// (token -> USDC, exactIn small amount) here.
const UNIVERSAL_ROUTER = '0x6fF5693b99212Da76ad316178A184AB56D299b43';

export async function swapFees(ctx: AgentContext, config: Config): Promise<StepResult> {
  // TODO(spec): build calldata from ctx.tokenAddress -> USDC via the V4 router.
  const calldata = '0x';
  log.detail('chain', `base (${BASE_CHAIN_ID})`);
  log.detail('router', UNIVERSAL_ROUTER);

  const { txHash } = await submitIntent(config, {
    keyId: ctx.keyId!,
    chainId: BASE_CHAIN_ID,
    to: UNIVERSAL_ROUTER,
    data: calldata,
    value: '0',
  });
  const basescanUrl = `https://basescan.org/tx/${txHash}`;
  log.detail('tx', txHash);

  return {
    patch: { txHash, basescanUrl },
    done: basescanUrl,
  };
}
