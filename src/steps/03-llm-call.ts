// Step 3/5 — call an LLM through the Shroud TEE proxy to author the repo's
// agent.ts, then commit that generated code back to the GitLawb repo from step 2.

import { generateCode } from '../clients/shroud.js';
import { pushFile } from '../clients/gitlawb.js';
import * as log from '../logger.js';
import type { Config } from '../config.js';
import type { AgentContext, StepResult } from '../types.js';

const PROMPT =
  'Write a minimal MCP server in TypeScript that exposes one tool, `get-time`, ' +
  'returning the current ISO timestamp. Output only the code.';

export async function llmCall(ctx: AgentContext, config: Config): Promise<StepResult> {
  log.detail('model', config.SHROUD_MODEL);
  const code = await generateCode(config, PROMPT);
  log.detail('generated', `${code.split('\n').length} lines, ${code.length} chars`);

  if (ctx.repoUrl) {
    await pushFile(config, {
      repoUrl: ctx.repoUrl,
      path: 'agent.ts',
      content: code,
      message: 'feat: LLM-generated MCP server (via Shroud)',
    });
  }

  return {
    patch: { generatedCode: code },
    done: `${code.length} chars committed`,
  };
}
