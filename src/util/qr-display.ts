// Terminal QR code rendering — side-by-side display for funding addresses.

import QRCode from 'qrcode';
import chalk from 'chalk';

const QR_OPTS = { type: 'utf8' as const, errorCorrectionLevel: 'L' as const, margin: 2 };

function stripAnsi(str: string): number {
  return str.replace(/\u001b\[[0-9;]*m/g, '').length;
}

function padRight(str: string, width: number): string {
  const visible = stripAnsi(str);
  return str + ' '.repeat(Math.max(0, width - visible));
}

async function renderQr(data: string): Promise<string[]> {
  const raw = await QRCode.toString(data, QR_OPTS);
  return raw.split('\n').filter((l) => l.length > 0);
}

export async function printQrSideBySide(
  left: { label: string; address: string; network: string },
  right: { label: string; address: string; network: string },
): Promise<void> {
  const [qrLeft, qrRight] = await Promise.all([
    renderQr(left.address),
    renderQr(right.address),
  ]);

  const maxLen = Math.max(...qrLeft.map((l) => l.length), ...qrRight.map((l) => l.length));
  const gap = '    ';
  const maxRows = Math.max(qrLeft.length, qrRight.length);

  console.log();
  const headerLeft = padRight(`  ${chalk.bold(left.label)} (${left.network})`, maxLen + 2);
  const headerRight = `  ${chalk.bold(right.label)} (${right.network})`;
  console.log(headerLeft + gap + headerRight);
  console.log();

  for (let i = 0; i < maxRows; i++) {
    const l = qrLeft[i] ?? '';
    const r = qrRight[i] ?? '';
    console.log(padRight(`  ${l}`, maxLen + 2) + gap + `  ${r}`);
  }

  console.log();
  const addrLeft = padRight(`  ${chalk.dim(left.address)}`, maxLen + 2);
  const addrRight = `  ${chalk.dim(right.address)}`;
  console.log(addrLeft + gap + addrRight);
  console.log();
}

export async function printSingleQr(
  info: { label: string; address: string; network: string },
): Promise<void> {
  const lines = await renderQr(info.address);
  console.log();
  console.log(`  ${chalk.bold(info.label)} (${info.network})`);
  console.log();
  for (const line of lines) {
    console.log(`  ${line}`);
  }
  console.log();
  console.log(`  ${chalk.dim(info.address)}`);
  console.log();
}
