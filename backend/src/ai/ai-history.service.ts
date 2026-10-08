import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { ChatMessage } from './ai.types';

const TTL_SECONDS = 3600;
const MAX_MESSAGES = 20;

export type SessionKind = 'customer' | 'admin';

/**
 * Lịch sử hội thoại lưu trong Redis với TTL (DOCUMENT.md §2.8).
 * Khoá được namespace theo loại phiên nên không thể dùng session_id của trợ lý admin
 * để đọc qua endpoint khách hàng (và ngược lại).
 * Chỉ lưu vai trò + nội dung văn bản; không ghi log nội dung nhạy cảm.
 */
@Injectable()
export class AiHistoryService {
  constructor(private readonly redis: RedisService) {}

  private key(kind: SessionKind, sessionId: string): string {
    return `ai:session:${kind}:${sessionId}`;
  }

  async load(kind: SessionKind, sessionId: string): Promise<ChatMessage[]> {
    const raw = await this.redis.get(this.key(kind, sessionId));
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((item) => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string')
        .slice(-MAX_MESSAGES) as ChatMessage[];
    } catch {
      return [];
    }
  }

  async append(kind: SessionKind, sessionId: string, messages: ChatMessage[]): Promise<void> {
    const existing = await this.load(kind, sessionId);
    const combined = [...existing, ...messages.filter((item) => item.role === 'user' || item.role === 'assistant')];
    const trimmed = combined.slice(-MAX_MESSAGES);
    await this.redis.set(this.key(kind, sessionId), JSON.stringify(trimmed), TTL_SECONDS);
  }

  async clear(kind: SessionKind, sessionId: string): Promise<void> {
    await this.redis.del(this.key(kind, sessionId));
  }
}
