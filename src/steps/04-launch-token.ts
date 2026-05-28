// Step 4/5 — launch a Bankr token tied to the repo and return its Base address.
// Riskiest step API-wise: prefers a programmatic launch, falls back to a
// Farcaster cast (see clients/bankr.ts).

import { launchToken } from '../clients/bankr.js';
import * as log from '../logger.js';
import type { Config } from '../config.js';
import type { AgentContext, StepResult } from '../types.js';

export async function launchTokenStep(ctx: AgentContext, config: Config): Promise<StepResult> {
  const symbol = (config.BANKR_TOKEN_SYMBOL || 'AGENT').toUpperCase();
  const existing = config.BANKR_EXISTING_TOKEN_ADDRESS.trim();
  if (existing) {
    const poolId = config.BANKR_EXISTING_POOL_ID.trim();
    if (!poolId) {
      throw new Error(
        '[step 4] BANKR_EXISTING_POOL_ID is required when BANKR_EXISTING_TOKEN_ADDRESS is set',
      );
    }
    log.detail('mode', 'reuse existing token (skip deploy)');
    log.detail('token', existing);
    log.detail('poolId', poolId);
    const deployTxHash = config.BANKR_EXISTING_DEPLOY_TX_HASH.trim() || undefined;
    if (deployTxHash) log.detail('deployTx', deployTxHash);
    return {
      patch: {
        tokenSymbol: symbol,
        tokenAddress: existing,
        poolId,
        deployTxHash,
      },
      done: existing,
    };
  }

  const name = config.BANKR_TOKEN_NAME.trim() || `Agent ${ctx.keyId!.split('-')[0]}`;
  const imageUrl = config.BANKR_TOKEN_IMAGE.trim();
  log.detail('name', name);
  log.detail('symbol', symbol);
  if (imageUrl) log.detail('image', imageUrl);

  const launch = await launchToken(config, {
    name,
    symbol,
    ownerDid: ctx.did!,
    repoUrl: ctx.repoUrl ?? '',
    imageUrl: imageUrl || undefined,
  });
  log.detail('token', launch.tokenAddress);
  log.detail('poolId', launch.poolId);
  if (launch.deployTxHash) log.detail('deployTx', launch.deployTxHash);

  return {
    patch: {
      tokenSymbol: symbol,
      tokenAddress: launch.tokenAddress,
      poolId: launch.poolId,
      deployTxHash: launch.deployTxHash,
    },
    done: launch.tokenAddress,
  };
}
