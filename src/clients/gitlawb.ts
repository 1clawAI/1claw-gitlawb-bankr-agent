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
}

export interface PushFileRequest {
  repoUrl: string;
  path: string;
  content: string;
  message: string;
}

const glEnv = (config: Config): NodeJS.ProcessEnv => ({
  ...process.env,
  PATH: `${process.env.HOME}/.local/bin:${process.env.PATH ?? ''}`,
  GITLAWB_NODE: config.GITLAWB_NODE_URL,
});

async function requireGl(config: Config): Promise<void> {
  const env = glEnv(config);
  try {
    await execa('gl', ['--version'], { env });
  } catch {
    throw new Error('[step 2] gitlawb: `gl` CLI not found — install from https://gitlawb.com/start');
  }
}

async function ensureGlIdentity(config: Config): Promise<void> {
  const env = glEnv(config);
  try {
    await execa('gl', ['identity', 'show'], { env });
  } catch {
    await execa('gl', ['identity', 'new'], { env });
  }
}

/** DID from the local `gl` identity — repos are registered under this owner. */
async function getGlDid(config: Config): Promise<string> {
  const env = glEnv(config);
  const { stdout } = await execa('gl', ['identity', 'show'], { env });
  const did = stdout.trim();
  if (!did.startsWith('did:key:')) {
    throw new Error(`[step 2] gitlawb: unexpected identity from \`gl identity show\`: ${did}`);
  }
  return did;
}

function repoAlreadyExists(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('409') || msg.includes('already exists');
}

export async function createRepo(config: Config, body: CreateRepoRequest): Promise<{ repoUrl: string }> {
  const env = glEnv(config);
  await requireGl(config);
  await ensureGlIdentity(config);

  // Repos are owned by the local `gl` Ed25519 identity (HTTP Signatures auth).
  // Step 1's 1Claw-derived DID is the agent's canonical identity elsewhere.
  const ownerDid = await getGlDid(config);
  await execa('gl', ['register', '--node', config.GITLAWB_NODE_URL], { env });
  try {
    await execa('gl', ['repo', 'create', body.name, '--description', 'autonomous 1Claw reference agent repo'], { env });
  } catch (err) {
    if (!repoAlreadyExists(err)) throw err;
  }
  return { repoUrl: `gitlawb://${ownerDid}/${body.name}` };
}

async function prepareWorktree(config: Config, repoUrl: string): Promise<string> {
  const env = glEnv(config);
  const work = mkdtempSync(join(tmpdir(), 'gitlawb-'));
  try {
    await execa('git', ['clone', '-q', repoUrl, work], { env });
  } catch {
    await execa('git', ['init', '-q', '-b', 'main'], { cwd: work, env });
    await execa('git', ['remote', 'add', 'origin', repoUrl], { cwd: work, env });
  }
  return work;
}

export async function pushFile(config: Config, body: PushFileRequest): Promise<void> {
  const env = glEnv(config);
  await requireGl(config);
  await ensureGlIdentity(config);

  const work = await prepareWorktree(config, body.repoUrl);
  writeFileSync(join(work, body.path), body.content);
  await execa('git', ['add', body.path], { cwd: work, env });
  const { stdout: status } = await execa('git', ['status', '--porcelain'], { cwd: work, env });
  if (!status.trim()) return;
  await execa('git', ['commit', '-q', '-m', body.message], { cwd: work, env });
  await execa('git', ['push', 'origin', 'main'], { cwd: work, env });
}
