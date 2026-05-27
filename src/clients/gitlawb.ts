// GitLawb client — decentralized git on IPFS/libp2p (step 2).
// Per github.com/Gitlawb/node the surface is CLI-first: the `gl` binary plus a
// `git-remote-gitlawb` helper that makes `gitlawb://<did>/<repo>` URLs work with
// native git. Identity is Ed25519/did:key; auth is HTTP Signatures (no token).

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execa } from 'execa';
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

async function requireGl(): Promise<void> {
  try {
    await execa('gl', ['--version']);
  } catch {
    throw new Error('[step 2] gitlawb: `gl` CLI not found — install from https://github.com/Gitlawb/node');
  }
}

export async function createRepo(config: Config, body: CreateRepoRequest): Promise<{ repoUrl: string }> {
  await requireGl();

  // TODO(spec): reconcile identity — `gl identity new` creates its own did:key,
  // but our DID comes from the 1Claw vault (step 1). Confirm `gl identity import`
  // (or equivalent) so the repo is owned by the vaulted DID, and confirm the
  // exact `gl register` / `gl repo create` flags.
  await execa('gl', ['register', '--node', config.GITLAWB_NODE_URL]).catch(() => undefined);
  await execa('gl', ['repo', 'create', body.name, '--description', 'autonomous 1Claw reference agent repo']);
  return { repoUrl: `gitlawb://${body.owner}/${body.name}` };
}

export async function pushFile(config: Config, body: PushFileRequest): Promise<void> {
  await requireGl();

  // TODO(spec): confirm the push flow. This drives native git through the
  // git-remote-gitlawb helper (one commit per file); a `gl` push subcommand may
  // be the intended path instead.
  const work = mkdtempSync(join(tmpdir(), 'gitlawb-'));
  writeFileSync(join(work, body.path), body.content);
  await execa('git', ['init', '-q', '-b', 'main'], { cwd: work });
  await execa('git', ['add', body.path], { cwd: work });
  await execa('git', ['commit', '-q', '-m', body.message], { cwd: work });
  await execa('git', ['push', body.repoUrl, 'main'], { cwd: work });
}
