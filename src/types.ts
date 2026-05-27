// Shared types threaded through the 5-step flow.
// AgentContext accumulates artifacts as each step runs; RunSummary is the final emitted JSON.

export interface AgentContext {
  // step 1 — DID
  did?: string;
  keyId?: string;
  publicKey?: string;
  // step 2 — repo
  repoName?: string;
  repoUrl?: string;
  // step 3 — LLM
  generatedCode?: string;
  // step 4 — token
  tokenSymbol?: string;
  tokenAddress?: string;
  // step 5 — swap
  txHash?: string;
  basescanUrl?: string;
}

// Each step returns a patch to merge into the context plus an optional
// artifact string to print on the step's "done" line.
export interface StepResult {
  patch: Partial<AgentContext>;
  done?: string;
}

export interface RunSummary {
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  failedStep?: number;
  artifacts: AgentContext;
}
