#!/usr/bin/env node
/**
 * Chờ một URL trả HTTP 2xx (dùng cho run.sh). Thoát 0 khi sẵn sàng, thoát 1 khi hết thời gian.
 * node scripts/wait-ready.mjs <url> [timeoutSeconds] [--expect=<jsonPath=value>]
 */
const [, , url, timeoutArg = '180', ...rest] = process.argv;
const timeoutMs = Number(timeoutArg) * 1000;
const expectArg = rest.find((item) => item.startsWith('--expect='));
const expect = expectArg ? expectArg.slice('--expect='.length) : null;
const startedAt = Date.now();

async function probe() {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return false;
    if (!expect) return true;
    const [path, value] = expect.split('=');
    const body = await response.json();
    const actual = path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), body);
    return String(actual) === value;
  } catch {
    return false;
  }
}

while (Date.now() - startedAt < timeoutMs) {
  if (await probe()) {
    // Ghi ra stderr: stdout chỉ được chứa đúng một dòng "URL: …" theo hợp đồng harness.
    process.stderr.write(`ready: ${url}\n`);
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

process.stderr.write(`timeout: ${url} chưa sẵn sàng sau ${timeoutArg}s\n`);
process.exit(1);
