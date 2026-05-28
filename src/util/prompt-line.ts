// Visible stdin prompt — for non-secret bootstrap settings (names, tickers).

import * as readline from 'node:readline/promises';

export async function promptLine(prompt: string, defaultValue = ''): Promise<string> {
  const stdin = process.stdin;
  const stdout = process.stdout;

  if (!stdin.isTTY) {
    if (defaultValue) return defaultValue;
    throw new Error('prompt requires an interactive terminal');
  }

  const hint = defaultValue ? ` [${defaultValue}]` : '';
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const answer = (await rl.question(`${prompt}${hint}: `)).trim();
    return answer || defaultValue;
  } finally {
    rl.close();
  }
}
