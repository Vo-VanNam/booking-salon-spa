#!/usr/bin/env node
/** HTTP probe helper for development/verification: node scripts/probe.mjs <method> <url> [json-body] */
const [, , method = 'GET', url, body] = process.argv;
const token = process.env.PROBE_TOKEN;
const headers = { 'Content-Type': 'application/json' };
if (token) headers.Authorization = `Bearer ${token}`;

const response = await fetch(url, { method, headers, body: body ?? undefined });
const text = await response.text();
console.log(`HTTP ${response.status}`);
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2).slice(0, 4000));
} catch {
  console.log(text.slice(0, 2000));
}
process.exit(0);
