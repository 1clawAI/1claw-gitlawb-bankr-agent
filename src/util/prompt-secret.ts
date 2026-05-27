// Masked stdin prompt — echoes * instead of the typed secret.

export function promptSecret(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    if (!stdin.isTTY) {
      reject(new Error('masked prompt requires an interactive terminal'));
      return;
    }

    stdout.write(prompt);

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let value = '';

    const cleanup = (): void => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
    };

    const onData = (chunk: string): void => {
      for (const char of chunk) {
        if (char === '\u0003') {
          cleanup();
          stdout.write('\n');
          process.exit(130);
        }
        if (char === '\r' || char === '\n') {
          cleanup();
          stdout.write('\n');
          resolve(value.trim());
          return;
        }
        if (char === '\u007f' || char === '\b') {
          if (value.length > 0) {
            value = value.slice(0, -1);
            stdout.write('\b \b');
          }
          continue;
        }
        value += char;
        stdout.write('*');
      }
    };

    stdin.on('data', onData);
  });
}
