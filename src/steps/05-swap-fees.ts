// Step 5/5 — swap a small amount of the launched token -> USDC on Uniswap V4
// (Base) by submitting an Intent to 1Claw. The HSM signs; the key never leaves it.

import { parseUnits } from 'viem';
import { submitIntent } from '../clients/oneclaw.js';
import { buildV4ExactInSwap, USDC } from '../util/v4-swap.js';
import * as log from '../logger.js';
import type { Config } from '../config.js';
import type { AgentContext, StepResult } from '../types.js';

const BASE_CHAIN_ID = 8453;
// Small illustrative amount of the freshly launched token (18 decimals).
const DEMO_AMOUNT_IN = parseUnits('1000', 18);

export async function swapFees(ctx: AgentContext, config: Config): Promise<StepResult> {
  // TODO(spec): discover the real V4 PoolKey (fee / tickSpacing / hooks) for the
  // Bankr/Clanker-launched token — these defaults are placeholders. Also note the
  // input token must be pre-approved to Permit2 -> UniversalRouter (prior intents).
  const swap = buildV4ExactInSwap({
    tokenIn: ctx.tokenAddress as `0x${string}`,
    tokenOut: USDC,
    fee: 10_000, // 1%
    tickSpacing: 200,
    hooks: '0x0000000000000000000000000000000000000000',
    amountIn: DEMO_AMOUNT_IN,
    amountOutMinimum: 0n, // demo only — no slippage protection
    deadline: BigInt(Math.floor(Date.now() / 1000) + 1200),
  });

  log.detail('chain', `base (${BASE_CHAIN_ID})`);
  log.detail('router', swap.to);
  log.detail('calldata', `${swap.data.slice(0, 18)}… (${(swap.data.length - 2) / 2} bytes)`);

  const { txHash } = await submitIntent(config, {
    keyId: ctx.keyId!,
    chainId: BASE_CHAIN_ID,
    to: swap.to,
    data: swap.data,
    value: swap.value,
  });
  const basescanUrl = `https://basescan.org/tx/${txHash}`;
  log.detail('tx', txHash);

  return {
    patch: { txHash, basescanUrl },
    done: basescanUrl,
  };
}
