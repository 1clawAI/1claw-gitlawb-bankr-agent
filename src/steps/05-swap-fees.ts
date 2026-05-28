// Step 5/5 — swap launched token → pool counter-currency on Uniswap V4 (Base) via 1Claw Intents.
// PoolKey is read from the Bankr deploy tx Initialize event; approvals use Permit2.

import { type Address, type Hex } from 'viem';
import { getBasePublicClient, getSigningAddress } from '../clients/evm-wallet.js';
import { submitIntent } from '../clients/oneclaw.js';
import {
  counterCurrency,
  fetchPoolKeyByPoolId,
  fetchPoolKeyFromDeployTx,
  type V4PoolKey,
} from '../util/pool-key.js';
import { ensurePermit2ForSwap, readTokenBalance } from '../util/permit2.js';
import { buildV4ExactInSwap } from '../util/v4-swap.js';
import * as log from '../logger.js';
import type { Config } from '../config.js';
import type { AgentContext, StepResult } from '../types.js';

const BASE_CHAIN_ID = 8453;
const DEMO_AMOUNT_IN = 1_000n * 10n ** 18n;

async function resolvePoolKey(
  ctx: AgentContext,
  config: Config,
): Promise<V4PoolKey> {
  const poolId = ctx.poolId!;
  const client = getBasePublicClient(config);

  if (ctx.deployTxHash) {
    return fetchPoolKeyFromDeployTx(client, ctx.deployTxHash as Hex, poolId);
  }
  return fetchPoolKeyByPoolId(client, poolId);
}

export async function swapFees(ctx: AgentContext, config: Config): Promise<StepResult> {
  if (!ctx.tokenAddress || !ctx.poolId) {
    throw new Error('[step 5] missing tokenAddress or poolId — run step 4 first');
  }

  const tokenIn = ctx.tokenAddress as Address;
  const pool = await resolvePoolKey(ctx, config);
  const tokenOut = counterCurrency(pool, tokenIn);

  const client = getBasePublicClient(config);
  const owner = await getSigningAddress(config);
  const balance = await readTokenBalance(client, tokenIn, owner);
  const amountIn = balance < DEMO_AMOUNT_IN ? balance : DEMO_AMOUNT_IN;
  log.detail('wallet', owner);
  log.detail('balance', balance.toString());
  if (amountIn === 0n) {
    if (config.AGENT_SWAP_DRY_RUN) {
      log.detail('dry-run', 'zero balance — building calldata only, skipping on-chain txs');
    } else {
      throw new Error(
        `[step 5] agent wallet ${owner} has zero token balance — fund it or set AGENT_SWAP_DRY_RUN=1 to verify calldata`,
      );
    }
  }

  log.detail('pool', ctx.poolId);
  log.detail('fee', String(pool.fee));
  log.detail('tickSpacing', String(pool.tickSpacing));
  log.detail('hooks', pool.hooks);
  log.detail('pair', `${pool.currency0} / ${pool.currency1}`);
  log.detail('amountIn', amountIn.toString());

  const swapAmount = amountIn === 0n ? DEMO_AMOUNT_IN : amountIn;
  if (amountIn > 0n) {
    await ensurePermit2ForSwap(config, client, owner, tokenIn, amountIn);
  }

  const swap = buildV4ExactInSwap({
    tokenIn,
    tokenOut,
    fee: pool.fee,
    tickSpacing: pool.tickSpacing,
    hooks: pool.hooks,
    amountIn: swapAmount,
    amountOutMinimum: 0n,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 1200),
  });

  log.detail('chain', `base (${BASE_CHAIN_ID})`);
  log.detail('swap', `${tokenIn} → ${tokenOut}`);
  log.detail('router', swap.to);
  log.detail('calldata', `${swap.data.slice(0, 18)}… (${(swap.data.length - 2) / 2} bytes)`);

  if (config.AGENT_SWAP_DRY_RUN || amountIn === 0n) {
    log.detail('dry-run', 'skipping intent submit');
    return {
      patch: { swapTokenOut: tokenOut },
      done: `dry-run ${tokenIn} → ${tokenOut}`,
    };
  }

  const { txHash } = await submitIntent(config, {
    chain: 'base',
    to: swap.to,
    data: swap.data,
    value: swap.value,
  });
  const basescanUrl = `https://basescan.org/tx/${txHash}`;
  log.detail('tx', txHash);

  return {
    patch: { txHash, basescanUrl, swapTokenOut: tokenOut },
    done: basescanUrl,
  };
}
