// Main entrypoint — runs the 5-step flow sequentially. Each step is wrapped in
// try/catch; on failure the loop stops but still writes run-summary.json with
// whatever completed, so the demo can show partial progress.

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import chalk from 'chalk';
import { loadConfig } from './config.js';
import { resolveSecrets } from './secrets.js';
import * as log from './logger.js';
import { createDid } from './steps/01-create-did.js';
import { pushRepo } from './steps/02-push-repo.js';
import { llmCall } from './steps/03-llm-call.js';
import { launchTokenStep } from './steps/04-launch-token.js';
import { swapFees } from './steps/05-swap-fees.js';
import type { Config } from './config.js';
import type { AgentContext, RunSummary, StepResult } from './types.js';

const TOTAL = 5;

function requireAgentConfig(config: Config): void {
  const missing: string[] = [];
  if (!config.ONECLAW_AGENT_API_KEY) missing.push('ONECLAW_AGENT_API_KEY');
  if (!config.ONECLAW_AGENT_ID) missing.push('ONECLAW_AGENT_ID');
  if (!config.ONECLAW_VAULT_ID) missing.push('ONECLAW_VAULT_ID');
  if (missing.length) {
    throw new Error(`missing required config: ${missing.join(', ')} — run \`pnpm bootstrap\` first`);
  }
}

type StepFn = (ctx: AgentContext, config: Config) => Promise<StepResult>;

const STEPS: Array<{ n: number; label: string; fn: StepFn }> = [
  { n: 1, label: 'deriving DID from the 1Claw agent identity...', fn: createDid },
  { n: 2, label: 'pushing repo to GitLawb...', fn: pushRepo },
  { n: 3, label: 'generating repo contents via Shroud TEE...', fn: llmCall },
  { n: 4, label: 'launching Bankr token...', fn: launchTokenStep },
  { n: 5, label: 'signing fee swap via 1Claw Intents...', fn: swapFees },
];

function seedExistingToken(ctx: AgentContext, config: Config): void {
  const token = config.BANKR_EXISTING_TOKEN_ADDRESS.trim();
  if (!token) return;
  ctx.tokenAddress = token;
  ctx.poolId = config.BANKR_EXISTING_POOL_ID.trim() || ctx.poolId;
  const deployTx = config.BANKR_EXISTING_DEPLOY_TX_HASH.trim();
  if (deployTx) ctx.deployTxHash = deployTx;
  if (config.BANKR_TOKEN_SYMBOL) ctx.tokenSymbol = config.BANKR_TOKEN_SYMBOL.toUpperCase();
  if (config.ONECLAW_AGENT_ID) ctx.keyId = config.ONECLAW_AGENT_ID;
}

async function main(): Promise<void> {
  const baseConfig = loadConfig();
  requireAgentConfig(baseConfig);
  if (baseConfig.AGENT_START_STEP > baseConfig.AGENT_END_STEP) {
    throw new Error('AGENT_START_STEP must be <= AGENT_END_STEP');
  }
  // Load the agent key, then pull third-party secrets from the 1Claw vault.
  const config = await resolveSecrets(baseConfig);
  const ctx: AgentContext = {};
  seedExistingToken(ctx, config);
  const startedAt = new Date().toISOString();
  let ok = true;
  let failedStep: number | undefined;

  const steps = STEPS.filter(
    (s) => s.n >= config.AGENT_START_STEP && s.n <= config.AGENT_END_STEP,
  );

  for (const step of steps) {
    const start = Date.now();
    log.stepStart(step.n, steps.length, step.label);
    try {
      const result = await step.fn(ctx, config);
      Object.assign(ctx, result.patch);
      log.stepDone(step.n, steps.length, ((Date.now() - start) / 1000).toFixed(1), result.done);
    } catch (err) {
      ok = false;
      failedStep = step.n;
      log.stepFail(step.n, steps.length, err instanceof Error ? err.message : String(err));
      break;
    }
  }

  const summary: RunSummary = {
    startedAt,
    finishedAt: new Date().toISOString(),
    ok,
    failedStep,
    artifacts: ctx,
  };
  const out = resolve(process.cwd(), 'run-summary.json');
  writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`);

  log.summary(ctx, ok, out);
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(chalk.red(`fatal: ${err instanceof Error ? err.stack : String(err)}`));
  process.exit(1);
});
