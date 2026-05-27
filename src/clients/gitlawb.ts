// GitLawb client — decentralized git on IPFS/libp2p (step 2).
// Creates a repo owned by the agent DID and pushes files. Auth is via the
// GITLAWB_TOKEN bearer for now; UCAN-signed auth is a follow-up.

import { withTimeout, DEFAULT_TIMEOUT_MS } from '../util/timeout.js';
import * as log from '../logger.js';
import type { Config } from '../config.js';

export interface CreateRepoRequest {
  name: string;
  owner: string; // the agent's did:key
}

export interface PushFileRequest {
  repoUrl: string;
  path: string;
  content: string;
  message: string;
}

export async function createRepo(config: Config, body: CreateRepoRequest): Promise<{ repoUrl: string }> {
  if (!config.GITLAWB_TOKEN) {
    log.stub('gitlawb — no GITLAWB_TOKEN, returning mock repo URL');
    return { repoUrl: `https://gitlawb.com/${body.owner.slice(-6)}/${body.name}` };
  }

  // TODO(spec): confirm HTTP API vs CLI surface — could not determine from
  // https://github.com/orgs/Gitlawb/repositories. Assuming POST /repos for now;
  // fall back to shelling out to a `gitlawb` CLI via execa if that's the real surface.
  return withTimeout('gitlawb create repo', DEFAULT_TIMEOUT_MS, async (signal) => {
    const res = await fetch(`${config.GITLAWB_API_URL}/repos`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.GITLAWB_TOKEN}`,
      },
      body: JSON.stringify({ name: body.name, owner: body.owner }),
      signal,
    });
    if (!res.ok) {
      throw new Error(`[step 2] gitlawb create repo failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { url?: string; repoUrl?: string };
    const repoUrl = json.repoUrl ?? json.url;
    if (!repoUrl) throw new Error('[step 2] gitlawb create repo: no repo URL in response');
    return { repoUrl };
  });
}

export async function pushFile(config: Config, body: PushFileRequest): Promise<void> {
  if (!config.GITLAWB_TOKEN) {
    log.stub(`gitlawb — no GITLAWB_TOKEN, skipping push of ${body.path}`);
    return;
  }

  // TODO(spec): confirm file-push surface — content-addressed commit endpoint vs git protocol.
  await withTimeout('gitlawb push file', DEFAULT_TIMEOUT_MS, async (signal) => {
    const res = await fetch(`${body.repoUrl}/contents/${body.path}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.GITLAWB_TOKEN}`,
      },
      body: JSON.stringify({ message: body.message, content: body.content }),
      signal,
    });
    if (!res.ok) {
      throw new Error(`[step 2] gitlawb push ${body.path} failed: ${res.status} ${await res.text()}`);
    }
  });
}
