import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { AddressInfo } from 'node:net';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';

export interface TestApp {
  app: INestApplication;
  baseUrl: string;
  close: () => Promise<void>;
}

/**
 * Dựng app thật (đầy đủ guard/interceptor/filter) trên cổng ngẫu nhiên, dùng DB test.
 * Không dùng mock cho HTTP: test đi qua đúng đường mà harness sẽ gọi.
 */
export async function bootTestApp(env: Record<string, string | undefined> = {}): Promise<TestApp> {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address() as AddressInfo;
  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await app.close();
    },
  };
}

export interface HttpResult<T = any> {
  status: number;
  json: T;
  text: string;
  headers: Headers;
}

export async function http<T = any>(
  baseUrl: string,
  method: string,
  path: string,
  options: { body?: unknown; token?: string; headers?: Record<string, string> } = {},
): Promise<HttpResult<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers ?? {}) };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, json, text, headers: response.headers };
}

/** Ngày (YYYY-MM-DD) theo giờ Việt Nam, lệch `offsetDays`. */
export function vnDate(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 10);
}

export async function login(baseUrl: string, email: string, password: string): Promise<string> {
  const result = await http(baseUrl, 'POST', '/auth/login', { body: { email, password } });
  if (result.status !== 200 || !result.json?.access_token) {
    throw new Error(`Đăng nhập thất bại (${result.status}): ${result.text.slice(0, 200)}`);
  }
  return result.json.access_token as string;
}
