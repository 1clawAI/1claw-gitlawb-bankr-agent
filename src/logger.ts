// Console wrapper with stage prefixes and color. Every step prints through here
// so the demo output reads as `[step N/5] …` with indented detail lines.

import chalk from 'chalk';
import type { AgentContext } from './types.js';

export function stepStart(n: number, total: number, msg: string): void {
  console.log(chalk.cyan.bold(`[step ${n}/${total}] ${msg}`));
}

export function detail(key: string, value: string): void {
  console.log(`  ${chalk.dim(`${key}:`)} ${value}`);
}

export function stepDone(n: number, total: number, seconds: string, extra?: string): void {
  const tail = extra ? ` — ${extra}` : '';
  console.log(chalk.green(`[step ${n}/${total}] done in ${seconds}s${tail}`));
}

export function stepFail(n: number, total: number, msg: string): void {
  console.log(chalk.red(`[step ${n}/${total}] failed — ${msg}`));
}

export function summary(ctx: AgentContext, ok: boolean, path: string): void {
  console.log('');
  console.log(ok ? chalk.green.bold('✓ run complete') : chalk.red.bold('✗ run ended early'));
  const rows: Array<[string, string | undefined]> = [
    ['DID', ctx.did],
    ['repo', ctx.repoUrl],
    ['token', ctx.tokenAddress],
    ['swap tx', ctx.basescanUrl],
  ];
  for (const [label, value] of rows) {
    console.log(`  ${chalk.dim(`${label}:`)} ${value ?? chalk.dim('—')}`);
  }
  console.log(`  ${chalk.dim('summary:')} ${path}`);
}
