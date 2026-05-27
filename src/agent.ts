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

type StepFn = (ctx: AgentContext, config: Config) => Promise<StepResult>;

const STEPS: Array<{ n: number; label: string; fn: StepFn }> = [
  { n: 1, label: 'creating DID + storing key in 1Claw vault...', fn: createDid },
  { n: 2, label: 'pushing repo to GitLawb...', fn: pushRepo },
  { n: 3, label: 'generating repo contents via Shroud TEE...', fn: llmCall },
  { n: 4, label: 'launching Bankr token...', fn: launchTokenStep },
  { n: 5, label: 'signing fee swap via 1Claw Intents...', fn: swapFees },
];

async function main(): Promise<void> {
  // Load the agent key, then pull third-party secrets from the 1Claw vault.
  const config = await resolveSecrets(loadConfig());
  const ctx: AgentContext = {};
  const startedAt = new Date().toISOString();
  let ok = true;
  let failedStep: number | undefined;

  for (const step of STEPS) {
    const start = Date.now();
    log.stepStart(step.n, TOTAL, step.label);
    try {
      const result = await step.fn(ctx, config);
      Object.assign(ctx, result.patch);
      log.stepDone(step.n, TOTAL, ((Date.now() - start) / 1000).toFixed(1), result.done);
    } catch (err) {
      ok = false;
      failedStep = step.n;
      log.stepFail(step.n, TOTAL, err instanceof Error ? err.message : String(err));
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
