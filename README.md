# 1Claw × GitLawb reference agent

A single-command autonomous agent that runs the full Bankr agentic dev stack end
to end. In one `pnpm agent` it:

1. **Generates an Ed25519 DID** and stores the private key in **1Claw's** HSM-backed vault
2. Uses that DID to **create and push a real repo to GitLawb** (decentralized git on IPFS/libp2p)
3. Calls an LLM through **1Claw's Shroud TEE proxy** to author the repo's contents
4. **Launches a Bankr token** tied to the repo
5. **Signs an on-chain fee swap** through 1Claw's Intents API — the private key never leaves the HSM

The run prints progress at each stage and emits `run-summary.json` with every
artifact (DID, repo URL, token address, swap tx hash).

> This is a **reference implementation**. Optimize for clarity — every file is
> meant to be readable by a developer who's never seen the stack.

## Architecture

```
                       ┌─────────────────────────────────────────────┐
                       │                pnpm agent                    │
                       │            (src/agent.ts — 5 steps)          │
                       └───┬─────────┬─────────┬─────────┬─────────┬──┘
                           │         │         │         │         │
                     step 1│   step 2│   step 3│   step 4│   step 5│
                           ▼         ▼         ▼         ▼         ▼
                     ┌─────────┐┌─────────┐┌─────────┐┌─────────┐┌─────────┐
                     │  1Claw  ││ GitLawb ││ Shroud  ││  Bankr  ││  1Claw  │
                     │  Vault  ││  repos  ││ TEE LLM ││  token  ││ Intents │
                     │  (HSM)  ││ IPFS/p2p││  proxy  ││  launch ││ (HSM)   │
                     └─────────┘└─────────┘└─────────┘└─────────┘└─────────┘
                       Ed25519     did:key    agent.ts  token CA   swap tx
                       did:key     repo URL   code      on Base    on Base

  Key custody:  the Ed25519 key is minted *inside* the 1Claw HSM (step 1); only
                the public half leaves. Step 5 signs via the HSM by key handle.
```

## Run it

```bash
pnpm install
cp .env.example .env          # add only your 1Claw HUMAN key
pnpm bootstrap                # provisions agent + vault, prompts for other secrets
pnpm agent                    # runs with the agent key; pulls secrets from 1Claw
```

With an empty `.env` everything still runs **end-to-end against stubs** — every
external call returns mock data, the DID is generated with real crypto, and
`run-summary.json` is written. So you can `pnpm agent` immediately, then bootstrap
real credentials when you're ready.

### How secrets work (two keys, vault-held)

You manage one secret; the agent manages the rest:

- **`ONECLAW_HUMAN_API_KEY`** — yours. Used *only* by `pnpm bootstrap` to create the
  agent, attach a policy, and write secrets to the vault. Never used at runtime.
- **`ONECLAW_AGENT_API_KEY` + `ONECLAW_AGENT_ID`** — the agent's own scoped key,
  written into `.env` by bootstrap. This is all `pnpm agent` needs.

`pnpm bootstrap` prompts for the third-party secrets (Bankr key, Neynar) and stores
them **in the 1Claw vault**, not in `.env`. At runtime the agent pulls them back by
name (`src/secrets.ts`). Shroud reuses the agent key, so no separate LLM key is needed.

```
  pnpm bootstrap                         pnpm agent
  ┌──────────────┐                       ┌──────────────┐
  │  HUMAN key   │── create agent ──▶     │  AGENT key   │── reads ──▶ 1Claw vault
  │  (you, once) │── attach policy        │ (.env, auto) │            (Bankr, Neynar…)
  └──────────────┘── store secrets ─▶ vault└──────────────┘
```

### Environment

| Var | Used by | Notes |
|-----|---------|-------|
| `ONECLAW_HUMAN_API_KEY` | `pnpm bootstrap` | the only key you set by hand |
| `ONECLAW_AGENT_API_KEY` / `ONECLAW_AGENT_ID` | `pnpm agent` | written by bootstrap |
| `BANKR_API_KEY`, `NEYNAR_*` | step 4 | stored in the 1Claw vault by bootstrap |
| `SHROUD_API_URL` / `SHROUD_MODEL` | step 3 | Shroud auths with the agent key |
| `GITLAWB_NODE_URL` (+ the `gl` CLI) | step 2 | identity-based, no token |
| `BASE_RPC_URL` | step 5 | Base RPC |

Blank entries in `.env` are treated as unset, so defaults apply.

## Project layout

```
src/
├── bootstrap.ts          # `pnpm bootstrap` — provision agent + vault (human key)
├── agent.ts              # `pnpm agent` — runs all 5 steps sequentially
├── config.ts             # env loading + zod schema
├── secrets.ts            # which secrets live in the vault; runtime overlay
├── logger.ts             # console wrapper, [step N/5] prefixes
├── types.ts              # shared Context + summary types
├── util/
│   ├── timeout.ts        # 30s timeout wrapper for all async I/O
│   └── v4-swap.ts        # Uniswap V4 swap calldata encoder (viem)
├── steps/
│   ├── 01-create-did.ts  # mint Ed25519 key in HSM, did:key
│   ├── 02-push-repo.ts   # create + push GitLawb repo
│   ├── 03-llm-call.ts    # Shroud LLM call, commit generated code
│   ├── 04-launch-token.ts# Bankr token launch
│   └── 05-swap-fees.ts   # 1Claw Intent swap
└── clients/
    ├── oneclaw.ts        # runtime: vault key/secret reads + Intents (agent key)
    ├── oneclaw-admin.ts  # bootstrap: create agent, policy, store secrets (human key)
    ├── gitlawb.ts        # gl CLI repo create/push wrapper
    ├── shroud.ts         # OpenAI-compatible TEE proxy client
    └── bankr.ts          # token launch wrapper
```

## Status

Each client now follows the real API surface documented by its service (see
[1Claw docs](https://docs.1claw.xyz/), [Bankr docs](https://docs.bankr.bot/),
[GitLawb node](https://github.com/Gitlawb/node)); when a credential is missing it
falls back to a stub so `pnpm agent` always runs end to end. Search for
`TODO(spec)` for the shapes still to be confirmed against live endpoints.

**Confirmed from docs and wired up:**
- **Shroud** — OpenAI-compatible body, auth via `X-Shroud-Agent-Key`, provider
  picked with `X-Shroud-Provider` (`claude-*` → `anthropic`).
- **Bankr** — `POST /agent/prompt` → poll `GET /agent/job/{jobId}`; `X-API-Key` auth.
- **GitLawb** — CLI-first (`gl repo create` + `gitlawb://` git remote via execa).

**Open questions for the spec author:**
- **1Claw key custody** — the spec's step 1 generates the key locally and POSTs the
  private key to the vault. 1Claw's docs say keys are minted *inside* the HSM, so
  this client now requests generation and receives only `{ keyId, publicKey }`. The
  private key never leaves the HSM. Confirm the vault generate endpoint + response.
- **1Claw Intents** — docs reference `POST /v1/agents/:id/transactions`; reconcile
  the exact field names (`chain`/`recipient`/signing-key-path vs `chainId`/`to`/`keyId`).
- **GitLawb identity** — `gl identity new` mints its own did:key; confirm how to make
  the repo owned by the vaulted DID from step 1 (`gl identity import`?).
- **Bankr token launch** — currently parses the contract address from the agent's
  reply; the structured Deploy API would be more robust.
- **Step 5 swap calldata** — Uniswap V4 router address + token→USDC calldata are stubbed.
