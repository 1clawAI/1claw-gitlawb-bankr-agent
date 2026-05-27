// Bankr client — launches a token tied to the repo (step 4).
// Two paths: a programmatic launch endpoint (preferred) or a Farcaster cast
// "@bankr launch $SYMBOL" via Neynar (fallback). Returns the Base contract address.

import { withTimeout, DEFAULT_TIMEOUT_MS } from '../util/timeout.js';
import * as log from '../logger.js';
import type { Config } from '../config.js';

export interface LaunchTokenRequest {
  name: string;
  symbol: string;
  ownerDid: string;
  repoUrl: string;
}

export async function launchToken(config: Config, body: LaunchTokenRequest): Promise<{ tokenAddress: string }> {
  // Preferred path: a direct Bankr launch endpoint.
  if (config.BANKR_API_URL) {
    // TODO(spec): confirm Bankr programmatic launch endpoint + response shape.
    // Could not confirm from https://bankr.bot — verify path and field names.
    return withTimeout('bankr launch', DEFAULT_TIMEOUT_MS, async (signal) => {
      const res = await fetch(`${config.BANKR_API_URL}/launch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
      if (!res.ok) {
        throw new Error(`[step 4] bankr launch failed: ${res.status} ${await res.text()}`);
      }
      const json = (await res.json()) as { contractAddress?: string; tokenAddress?: string };
      const tokenAddress = json.tokenAddress ?? json.contractAddress;
      if (!tokenAddress) throw new Error('[step 4] bankr launch: no contract address in response');
      return { tokenAddress };
    });
  }

  // Fallback path: post a Farcaster cast and poll bankr's reply for the address.
  if (config.NEYNAR_API_KEY && config.NEYNAR_SIGNER_UUID) {
    // TODO(spec): post cast `@bankr launch $${symbol}` via Neynar, then poll the
    // conversation for bankr's reply containing the deployed contract address.
    // POST https://api.neynar.com/v2/farcaster/cast { signer_uuid, text }
    log.stub('bankr — Neynar fallback not yet implemented, returning mock token address');
    return { tokenAddress: `0x${'cd'.repeat(20)}` };
  }

  log.stub('bankr — no BANKR_API_URL or Neynar creds, returning mock token address');
  return { tokenAddress: `0x${'cd'.repeat(20)}` };
}
