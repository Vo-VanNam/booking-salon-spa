'use client';

import * as React from 'react';
import { Bot, Send, Sparkles } from 'lucide-react';
import { aiApi, ApiError } from '@/lib/api';
import type { ChatResponse } from '@/lib/types';
import { useAdminBranch } from '@/lib/use-admin-branch';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: { name: string; success: boolean }[];
}

const SUGGESTIONS = [
  'Doanh thu tháng này là bao nhiêu?',
  'Top 3 dịch vụ được đặt nhiều nhất?',
  'Tỷ lệ hủy lịch hiện tại?',
  'Stylist nào làm nhiều lịch nhất?',
];

/**
 * Trợ lý phân tích cho admin (DOCUMENT.md §2.9).
 * Model chỉ gọi được các API analytics trong whitelist; phạm vi chi nhánh do server quyết định theo role.
 */
export default function AdminAiPage() {
  const { branchId } = useAdminBranch();
  const [messages, setMessages] = React.useState<Message[]>([
    {
      role: 'assistant',
      content:
        'Tôi có thể trả lời về doanh thu, top dịch vụ, top stylist và tỷ lệ hủy lịch. Số liệu lấy trực tiếp từ hệ thống theo quyền của bạn.',
    },
  ]);
  const [input, setInput] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sessionId] = React.useState(() => `admin-ui-${Math.random().toString(36).slice(2, 10)}`);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setMessages((current) => [...current, { role: 'user', content: message }]);
    setInput('');
    setBusy(true);
    setError(null);
    try {
      const response: ChatResponse = await aiApi.adminChat({ message, session_id: sessionId });
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: response.reply, toolCalls: response.tool_calls },
      ]);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="px-4 py-4">
      <header className="mb-3">
        <h1 className="text-title font-semibold text-ink">Trợ lý phân tích</h1>
        <p className="text-body-sm text-muted">
          Hỏi bằng tiếng Việt về kinh doanh. Phạm vi dữ liệu:{' '}
          <span className="font-medium text-ink">{branchId ? 'chi nhánh đang chọn' : 'toàn chuỗi (theo quyền)'}</span>.
        </p>
      </header>

      {error ? <Alert tone="danger" title={error} className="mb-3" /> : null}

      <Card className="flex h-[min(640px,70vh)] flex-col">
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 thin-scroll">
          {messages.map((message, index) => (
            <div key={index} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-card px-3 py-2 text-body-sm ${
                  message.role === 'user' ? 'bg-accent text-surface' : 'border border-border bg-surface-2 text-ink'
                }`}
              >
                {message.role === 'assistant' ? (
                  <span className="mb-1 flex items-center gap-1 text-meta text-info">
                    <Bot size={12} aria-hidden /> Trợ lý phân tích
                  </span>
                ) : null}
                {message.content}
                {message.toolCalls && message.toolCalls.length > 0 ? (
                  <p className="mt-1 text-meta text-muted">
                    Nguồn: {message.toolCalls.map((call) => call.name).join(', ')}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
          {busy ? <p className="text-body-sm text-muted">Đang tổng hợp số liệu…</p> : null}
        </div>

        <div className="flex flex-wrap gap-1 px-4 pb-2">
          {SUGGESTIONS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => void send(item)}
              className="rounded-full border border-border bg-surface px-2.5 py-1 text-meta text-ink hover:bg-surface-2"
            >
              <Sparkles size={12} className="mr-1 inline text-accent" aria-hidden />
              {item}
            </button>
          ))}
        </div>

        <form
          className="flex items-center gap-2 border-t border-border px-4 py-3"
          onSubmit={(event) => {
            event.preventDefault();
            void send(input);
          }}
        >
          <Input
            id="admin-ai-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ví dụ: doanh thu 7 ngày gần nhất?"
            aria-label="Câu hỏi cho trợ lý phân tích"
          />
          <Button type="submit" loading={busy} aria-label="Gửi câu hỏi">
            <Send size={16} aria-hidden />
          </Button>
        </form>
      </Card>
      <p className="mt-2 text-meta text-muted">
        Trợ lý không sinh SQL và không truy cập dữ liệu ngoài các API analytics được cấp.
      </p>
    </main>
  );
}
