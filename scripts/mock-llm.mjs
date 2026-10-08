#!/usr/bin/env node
/**
 * Mock LLM tương thích OpenAI để kiểm tra /ai/chat trên hệ thống đang chạy.
 *   MOCK_SCRIPT=<file.json>  mảng phản hồi theo thứ tự; đổi nội dung file → bộ đếm tự reset.
 *   MOCK_LOG=<file.jsonl>    ghi lại mọi request nhận được (để kiểm chứng tool result).
 */
import { createServer } from 'node:http';
import { readFileSync, appendFileSync, existsSync } from 'node:fs';

const port = Number(process.env.MOCK_PORT ?? 8899);
const scriptPath = process.env.MOCK_SCRIPT ?? '/tmp/mock-script.json';
const logPath = process.env.MOCK_LOG ?? '/tmp/mock-llm.jsonl';

let lastScriptHash = '';
let index = 0;

function loadScript() {
  let raw = '[]';
  try {
    raw = readFileSync(scriptPath, 'utf8');
  } catch {
    raw = '[]';
  }
  if (raw !== lastScriptHash) {
    lastScriptHash = raw;
    index = 0;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

const server = createServer((request, response) => {
  if (!request.url?.includes('/chat/completions')) {
    response.writeHead(404).end('not found');
    return;
  }
  let body = '';
  request.on('data', (chunk) => {
    body += chunk;
  });
  request.on('end', () => {
    const script = loadScript();
    const entry = script[index] ?? { text: 'Xin chào, tôi có thể giúp gì cho bạn?' };
    index += 1;

    try {
      appendFileSync(
        logPath,
        `${JSON.stringify({ index: index - 1, authorization: request.headers.authorization, body: JSON.parse(body || '{}') })}\n`,
      );
    } catch {
      /* ghi log thất bại không ảnh hưởng kết quả */
    }

    const message = entry.tool_call
      ? {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: entry.id ?? `call_${index}`,
              type: 'function',
              function: { name: entry.tool_call.name, arguments: JSON.stringify(entry.tool_call.arguments ?? {}) },
            },
          ],
        }
      : { role: 'assistant', content: entry.text ?? 'Xin chào' };

    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        id: `mock-${index}`,
        object: 'chat.completion',
        model: 'mock-model',
        choices: [{ index: 0, message, finish_reason: entry.tool_call ? 'tool_calls' : 'stop' }],
      }),
    );
  });
});

server.listen(port, '127.0.0.1', () => {
  process.stderr.write(`mock-llm: http://127.0.0.1:${port}/v1 (script=${scriptPath}, log=${logPath})\n`);
  if (!existsSync(scriptPath)) appendFileSync(scriptPath, '[]');
});
