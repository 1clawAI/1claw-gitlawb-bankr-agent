// Bankr client — launches a token tied to the repo (step 4).
// Per docs.bankr.bot the documented agent flow is: POST /agent/prompt -> { jobId },
// then poll GET /agent/job/{jobId} until status === 'completed'. The reply text
// contains the deployed Base contract address. A structured Deploy API also exists.

import { withTimeout, TimeoutError } from '../util/timeout.js';
import * as log from '../logger.js';
import type { Config } from '../config.js';

export interface LaunchTokenRequest {
  name: string;
  symbol: string;
  ownerDid: string;
  repoUrl: string;
}

// Token deploys take longer than the 30s I/O default, so the whole poll gets a
// wider budget; each individual fetch still inherits its own request timeout.
const LAUNCH_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 2_000;
const ADDRESS_RE = /0x[a-fA-F0-9]{40}/;

interface PromptResponse {
  success: boolean;
  jobId: string;
}
interface JobResponse {
  success: boolean;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  response?: string;
  error?: string;
}

export async function launchToken(config: Config, body: LaunchTokenRequest): Promise<{ tokenAddress: string }> {
  if (!config.BANKR_API_KEY) {
    log.stub('bankr — no BANKR_API_KEY, returning mock token address');
    return { tokenAddress: `0x${'cd'.repeat(20)}` };
  }

  // TODO(spec): prefer the structured Deploy API
  // (POST /token-launch/deploy per docs.bankr.bot/token-launching) over parsing
  // the agent's free-text reply, once its request/response schema is confirmed.
  const headers = { 'content-type': 'application/json', 'X-API-Key': config.BANKR_API_KEY };
  const prompt =
    `Launch a token named "${body.name}" with symbol $${body.symbol} on Base. ` +
    `Associate it with the repo ${body.repoUrl}.`;

  return withTimeout('bankr token launch', LAUNCH_TIMEOUT_MS, async (signal) => {
    const submit = await fetch(`${config.BANKR_API_URL}/agent/prompt`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ prompt }),
      signal,
    });
    if (!submit.ok) {
      throw new Error(`[step 4] bankr launch failed: ${submit.status} ${await submit.text()}`);
    }
    const { jobId } = (await submit.json()) as PromptResponse;

    // Poll until the job completes (or the outer timeout aborts the loop).
    while (!signal.aborted) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const poll = await fetch(`${config.BANKR_API_URL}/agent/job/${jobId}`, { headers, signal });
      if (!poll.ok) {
        throw new Error(`[step 4] bankr job poll failed: ${poll.status} ${await poll.text()}`);
      }
      const job = (await poll.json()) as JobResponse;
      if (job.status === 'failed') throw new Error(`[step 4] bankr launch failed: ${job.error ?? 'unknown'}`);
      if (job.status === 'completed') {
        const tokenAddress = job.response?.match(ADDRESS_RE)?.[0];
        if (!tokenAddress) {
          throw new Error(`[step 4] bankr launch: no contract address in reply: ${job.response ?? ''}`);
        }
        return { tokenAddress };
      }
    }
    throw new TimeoutError('bankr token launch', LAUNCH_TIMEOUT_MS);
  });
}
