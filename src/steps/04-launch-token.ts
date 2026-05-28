// Step 4/5 — launch a Bankr token tied to the repo and return its Base address.
// Riskiest step API-wise: prefers a programmatic launch, falls back to a
// Farcaster cast (see clients/bankr.ts).

import { launchToken } from '../clients/bankr.js';
import * as log from '../logger.js';
import type { Config } from '../config.js';
import type { AgentContext, StepResult } from '../types.js';

export async function launchTokenStep(ctx: AgentContext, config: Config): Promise<StepResult> {
  const symbol = (config.BANKR_TOKEN_SYMBOL || 'AGENT').toUpperCase();
  const name = config.BANKR_TOKEN_NAME.trim() || `Agent ${ctx.keyId!.split('-')[0]}`;
  log.detail('name', name);
  log.detail('symbol', symbol);

  const { tokenAddress } = await launchToken(config, {
    name,
    symbol,
    ownerDid: ctx.did!,
    repoUrl: ctx.repoUrl ?? '',
  });
  log.detail('token', tokenAddress);

  return {
    patch: { tokenSymbol: symbol, tokenAddress },
    done: tokenAddress,
  };
}
