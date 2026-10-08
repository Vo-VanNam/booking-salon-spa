export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LlmResponse {
  content: string | null;
  tool_calls: ToolCall[];
  finish_reason?: string;
  usage?: unknown;
}

export interface ExecutedToolCall {
  name: string;
  arguments: unknown;
  success: boolean;
  result_preview?: string;
}

export function parseToolArguments(raw: unknown): Record<string, unknown> {
  if (raw === undefined || raw === null || raw === '') return {};
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
      return {};
    } catch {
      throw new Error('Tham số công cụ không phải JSON hợp lệ.');
    }
  }
  return {};
}

export function requireString(args: Record<string, unknown>, key: string, label: string): string {
  const value = args[key];
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Thiếu tham số bắt buộc: ${label} (${key}).`);
  }
  return value.trim();
}

export function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') return undefined;
  return value.trim() === '' ? undefined : value.trim();
}

export function optionalInt(args: Record<string, unknown>, key: string, fallback: number): number {
  const value = args[key];
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
