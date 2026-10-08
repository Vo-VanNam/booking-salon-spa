'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bot, MessageCircle, Send, X } from 'lucide-react';
import { aiApi, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  needsHuman?: boolean;
}

const SUGGESTIONS = ['Chi nhánh nào gần Quận 3?', 'Giá dịch vụ ở chi nhánh 1?', 'Ngày mai còn giờ trống không?'];

/**
 * Widget chat tiếng Việt trên trang đặt lịch (DOCUMENT.md §2.8).
 * Mọi câu trả lời đến từ /ai/chat (server-side, có kiểm soát công cụ) — không có khoá AI ở client.
 */
export function AiChatWidget() {
  const [open, setOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<ChatMessage[]>([
    { role: 'assistant', content: 'Xin chào! Mình là trợ lý đặt lịch. Bạn cần tư vấn dịch vụ, giá hay khung giờ trống?' },
  ]);
  const [input, setInput] = React.useState('');
  const [sessionId] = React.useState(() => `web-${Math.random().toString(36).slice(2, 10)}`);
  const [thinking, setThinking] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || thinking) return;
    setMessages((current) => [...current, { role: 'user', content: message }]);
    setInput('');
    setThinking(true);
    setError(null);
    try {
      const response = await aiApi.chat({ message, session_id: sessionId });
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: response.reply, needsHuman: response.needs_human },
      ]);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setThinking(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? 'Đóng trợ lý đặt lịch' : 'Mở trợ lý đặt lịch'}
        className="fixed bottom-4 right-4 z-40 flex h-14 items-center gap-2 rounded-full border border-[#DCCDB8] bg-accent px-4 text-surface shadow-md transition-transform duration-micro hover:scale-[1.02]"
      >
        {open ? <X size={20} aria-hidden /> : <MessageCircle size={20} aria-hidden />}
        <span className="text-body-sm font-medium">{open ? 'Đóng' : 'Trợ lý đặt lịch'}</span>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
            aria-label="Khung chat với trợ lý đặt lịch"
            className="fixed bottom-20 right-4 z-40 flex h-[min(560px,75vh)] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-card border border-border bg-surface shadow-md"
          >
            <header className="flex items-center gap-2 border-b border-border bg-surface-2 px-3 py-2.5">
              <Bot size={18} className="text-accent" aria-hidden />
              <div>
                <p className="text-body-sm font-medium text-ink">Trợ lý đặt lịch</p>
                <p className="text-meta text-muted">Trả lời từ dữ liệu thật của salon</p>
              </div>
            </header>

            <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3 thin-scroll">
              {messages.map((message, index) => (
                <div
                  key={`${index}-${message.content.slice(0, 12)}`}
                  className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
                >
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap rounded-card px-3 py-2 text-body-sm ${
                      message.role === 'user'
                        ? 'bg-accent text-surface'
                        : 'border border-border bg-surface-2 text-ink'
                    }`}
                  >
                    {message.content}
                    {message.needsHuman ? (
                      <p className="mt-1 text-meta text-info">Đã ghi nhận — nhân viên sẽ liên hệ hỗ trợ bạn.</p>
                    ) : null}
                  </div>
                </div>
              ))}
              {thinking ? (
                <div className="flex items-center gap-2 text-meta text-muted" role="status">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-accent" aria-hidden />
                  Đang trả lời…
                </div>
              ) : null}
              {error ? <p className="text-body-sm text-danger">{error}</p> : null}
            </div>

            {messages.length <= 1 ? (
              <div className="flex flex-wrap gap-1 px-3 pb-2">
                {SUGGESTIONS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => void send(item)}
                    className="rounded-full border border-border bg-surface px-2.5 py-1 text-meta text-ink hover:bg-surface-2"
                  >
                    {item}
                  </button>
                ))}
              </div>
            ) : null}

            <form
              className="flex items-center gap-2 border-t border-border px-3 py-2"
              onSubmit={(event) => {
                event.preventDefault();
                void send(input);
              }}
            >
              <Input
                id="ai-chat-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Nhập câu hỏi…"
                aria-label="Nội dung tin nhắn"
              />
              <Button type="submit" size="icon" aria-label="Gửi tin nhắn" loading={thinking}>
                <Send size={16} aria-hidden />
              </Button>
            </form>
          </motion.section>
        ) : null}
      </AnimatePresence>
    </>
  );
}
