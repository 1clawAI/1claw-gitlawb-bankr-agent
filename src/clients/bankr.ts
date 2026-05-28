// Bankr client — launches a token tied to the repo (step 4).
// Uses POST /token-launches/deploy (structured deploy API). The legacy
// /agent/prompt flow requires Bankr Club and is not used here.

import { withTimeout } from '../util/timeout.js';
import type { Config } from '../config.js';

export interface LaunchTokenRequest {
  name: string;
  symbol: string;
  ownerDid: string;
  repoUrl: string;
  imageUrl?: string;
}

const LAUNCH_TIMEOUT_MS = 90_000;
const ADDRESS_RE = /0x[a-fA-F0-9]{40}/;

interface DeployResponse {
  success?: boolean;
  tokenAddress?: string;
  poolId?: string;
  txHash?: string;
  chain?: string;
  error?: string;
  message?: string;
}

export interface LaunchTokenResult {
  tokenAddress: string;
  poolId: string;
  deployTxHash?: string;
}

function parseBankrError(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as DeployResponse;
    const detail = parsed.message ?? parsed.error ?? body;
    if (status === 403 && detail.toLowerCase().includes('bankr club')) {
      return `[step 4] bankr: Token Launch API requires Bankr Club — join at https://bankr.bot/club, then re-run \`pnpm agent\``;
    }
    if (status === 403 && detail.toLowerCase().includes('24 hours')) {
      return `[step 4] bankr: wallet must be 24h old before token deploy — ${detail}`;
    }
    if (status === 403 && detail.toLowerCase().includes('read-only')) {
      return `[step 4] bankr: API key is read-only — enable write access (and Token Launch) at https://bankr.bot/api, then update the vault secret or set BANKR_API_KEY in .env`;
    }
    return `[step 4] bankr deploy failed: ${status} ${detail}`;
  } catch {
    return `[step 4] bankr deploy failed: ${status} ${body}`;
  }
}

export async function launchToken(config: Config, body: LaunchTokenRequest): Promise<LaunchTokenResult> {
  if (!config.BANKR_API_KEY) {
    throw new Error(
      '[step 4] bankr: BANKR_API_KEY is required — store a read-write key in the 1Claw vault via `pnpm bootstrap` or set it in .env',
    );
  }

  const headers = { 'content-type': 'application/json', 'X-API-Key': config.BANKR_API_KEY };
  const payload: Record<string, string | undefined> = {
    tokenName: body.name,
    tokenSymbol: body.symbol,
    description: `Autonomous 1Claw agent token. Owner DID: ${body.ownerDid}. Repo: ${body.repoUrl}`,
    websiteUrl: body.repoUrl.startsWith('gitlawb://') ? undefined : body.repoUrl,
  };
  if (body.imageUrl) payload.image = body.imageUrl;

  return withTimeout('bankr token deploy', LAUNCH_TIMEOUT_MS, async (signal) => {
    const res = await fetch(`${config.BANKR_API_URL}/token-launches/deploy`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(parseBankrError(res.status, text));

    const data = JSON.parse(text) as DeployResponse;
    const tokenAddress = data.tokenAddress ?? text.match(ADDRESS_RE)?.[0];
    if (!tokenAddress) {
      throw new Error(`[step 4] bankr deploy: no tokenAddress in response: ${text}`);
    }
    const poolId = data.poolId;
    if (!poolId) {
      throw new Error(`[step 4] bankr deploy: no poolId in response — cannot build V4 swap without pool metadata`);
    }
    return { tokenAddress, poolId, deployTxHash: data.txHash };
  });
}
