import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthUser } from '../auth/auth.decorators';
import { aiConfig } from '../common/config';
import { AppLogger } from '../common/logger';
import { sanitizeText } from '../common/validators';
import { PrismaService } from '../prisma/prisma.module';
import { AiHistoryService } from './ai-history.service';
import { ChatMessage, ExecutedToolCall, parseToolArguments, ToolDefinition } from './ai.types';
import { LlmClient } from './llm.client';
import { analyticsSystemPrompt, customerSystemPrompt, HANDOFF_PATTERN } from './prompts';
import { AnalyticsToolRegistry, CustomerToolRegistry, ToolContext, RegisteredTool, toolErrorMessage } from './tools/tool-registry';

export interface AiChatRequest {
  message: string;
  sessionId?: string;
}

export interface AiChatResult {
  reply: string;
  /** Alias của reply — hợp đồng harness chấp nhận cả hai tên field. */
  message: string;
  session_id: string;
  needs_human: boolean;
  tool_calls: ExecutedToolCall[];
}

interface LoopResult {
  reply: string;
  toolCalls: ExecutedToolCall[];
  needsHuman: boolean;
}

/**
 * Trợ lý AI (DOCUMENT.md §2.8 khách hàng, §2.9 admin):
 *  - chạy hoàn toàn server-side, gọi LLM tương thích OpenAI qua env;
 *  - bắt buộc dùng function calling, không parse text tự do để đặt lịch;
 *  - chỉ thực thi công cụ nằm trong whitelist, mọi công cụ khác bị từ chối và ghi audit.
 */
@Injectable()
export class AiService {
  private readonly logger = new AppLogger('ai');

  constructor(
    private readonly llm: LlmClient,
    private readonly history: AiHistoryService,
    private readonly customerTools: CustomerToolRegistry,
    private readonly analyticsTools: AnalyticsToolRegistry,
    private readonly prisma: PrismaService,
  ) {}

  async chat(request: AiChatRequest): Promise<AiChatResult> {
    this.assertConfigured();
    const message = sanitizeText(request.message ?? '', 2000);
    if (!message) throw new BadRequestException('Vui lòng nhập nội dung tin nhắn.');
    const sessionId = sanitizeText(request.sessionId ?? '', 100) || randomUUID();

    const history = await this.history.load('customer', sessionId);
    const messages: ChatMessage[] = [
      { role: 'system', content: customerSystemPrompt() },
      ...history,
      { role: 'user', content: message },
    ];

    const context: ToolContext = { sessionId, actor: 'ai' };
    const result = await this.runLoop(messages, this.customerTools, context);

    await this.history.append('customer', sessionId, [
      { role: 'user', content: message },
      { role: 'assistant', content: result.reply },
    ]);
    await this.touchSession(sessionId, 'customer', null, result.needsHuman || HANDOFF_PATTERN.test(message));

    this.logger.log('Đã trả lời hội thoại AI', {
      session_id: sessionId,
      tool_calls: result.toolCalls.map((call) => call.name),
      reply_length: result.reply.length,
    });

    return {
      reply: result.reply,
      message: result.reply,
      session_id: sessionId,
      needs_human: result.needsHuman,
      tool_calls: result.toolCalls,
    };
  }

  async adminChat(user: AuthUser, request: AiChatRequest): Promise<AiChatResult> {
    this.assertConfigured();
    const message = sanitizeText(request.message ?? '', 2000);
    if (!message) throw new BadRequestException('Vui lòng nhập nội dung tin nhắn.');
    const sessionId = sanitizeText(request.sessionId ?? '', 100) || `admin-${user.id}-${randomUUID().slice(0, 8)}`;

    const history = await this.history.load('admin', sessionId);
    const messages: ChatMessage[] = [
      { role: 'system', content: analyticsSystemPrompt() },
      ...history,
      { role: 'user', content: message },
    ];

    const context: ToolContext = { sessionId, actor: user.id, user };
    const result = await this.runLoop(messages, this.analyticsTools, context);

    await this.history.append('admin', sessionId, [
      { role: 'user', content: message },
      { role: 'assistant', content: result.reply },
    ]);
    await this.touchSession(sessionId, 'admin', user.id, false);

    return {
      reply: result.reply,
      message: result.reply,
      session_id: sessionId,
      needs_human: false,
      tool_calls: result.toolCalls,
    };
  }

  async listSessions(needsHumanOnly = false) {
    const sessions = await this.prisma.aiSession.findMany({
      where: needsHumanOnly ? { needsHuman: true } : {},
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    return sessions.map((session) => ({
      session_id: session.sessionId,
      kind: session.kind,
      needs_human: session.needsHuman,
      reason: session.reason,
      updated_at: session.updatedAt.toISOString(),
    }));
  }

  async toolCallLog(sessionId: string) {
    const items = await this.prisma.aiToolCall.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    return items.map((item) => ({
      id: item.id,
      tool_name: item.toolName,
      arguments: item.arguments,
      result_preview: item.resultPreview,
      success: item.success,
      created_at: item.createdAt.toISOString(),
    }));
  }

  private assertConfigured(): void {
    const config = aiConfig();
    if (!config?.baseUrl) {
      throw new ServiceUnavailableException(
        'Trợ lý AI chưa được cấu hình. Bạn vẫn có thể đặt lịch bằng biểu mẫu hoặc gọi trực tiếp chi nhánh.',
      );
    }
  }

  private async runLoop(
    messages: ChatMessage[],
    registry: { definitions: () => ToolDefinition[]; get: (name: string) => RegisteredTool | undefined },
    context: ToolContext,
  ): Promise<LoopResult> {
    const config = aiConfig();
    const maxRounds = config?.maxToolRounds ?? 6;
    const tools = registry.definitions();
    const executed: ExecutedToolCall[] = [];
    let needsHuman = false;

    for (let round = 0; round < maxRounds; round += 1) {
      const response = await this.llm.chat(messages, tools);

      if (response.tool_calls.length === 0) {
        const reply = (response.content ?? '').trim();
        return {
          reply: reply || 'Xin lỗi, tôi chưa có câu trả lời cho nội dung này. Bạn có thể nói rõ hơn hoặc để lại số điện thoại để nhân viên hỗ trợ.',
          toolCalls: executed,
          needsHuman,
        };
      }

      messages.push({ role: 'assistant', content: response.content ?? '', tool_calls: response.tool_calls });

      for (const call of response.tool_calls) {
        const name = call.function?.name ?? '';
        const tool = name ? registry.get(name) : undefined;
        let payload: unknown;
        let success = true;

        if (!tool) {
          // Guardrail: công cụ ngoài whitelist tuyệt đối không được thực thi.
          success = false;
          payload = {
            error: `Công cụ "${name}" không nằm trong danh sách được phép. Yêu cầu bị từ chối.`,
          };
          this.logger.warn('Từ chối công cụ ngoài whitelist', { session_id: context.sessionId, tool: name });
        } else {
          try {
            const args = parseToolArguments(call.function?.arguments);
            const validated = tool.validate(args);
            const outcome = await tool.handle(validated, context);
            payload = outcome.data;
            success = outcome.success !== false;
            if (name === 'request_human_support') needsHuman = true;
          } catch (error) {
            success = false;
            payload = { error: toolErrorMessage(error) };
          }
        }

        executed.push({
          name: name || 'unknown',
          arguments: this.safeParse(call.function?.arguments),
          success,
        });
        await this.auditToolCall(context.sessionId, name, call.function?.arguments, payload, success);
        messages.push({
          role: 'tool',
          tool_call_id: call.id || name || 'call',
          name: name || 'unknown',
          content: JSON.stringify(payload ?? {}).slice(0, 8000),
        });
      }
    }

    return {
      reply: 'Xin lỗi, tôi cần thêm thông tin để hỗ trợ chính xác. Bạn vui lòng để lại số điện thoại hoặc gọi trực tiếp chi nhánh để được nhân viên hỗ trợ.',
      toolCalls: executed,
      needsHuman: true,
    };
  }

  private safeParse(raw: unknown): unknown {
    if (typeof raw !== 'string') return raw ?? {};
    try {
      return JSON.parse(raw);
    } catch {
      return { raw: raw.slice(0, 200) };
    }
  }

  private async auditToolCall(
    sessionId: string,
    toolName: string,
    args: unknown,
    result: unknown,
    success: boolean,
  ): Promise<void> {
    try {
      await this.prisma.aiToolCall.create({
        data: {
          sessionId,
          toolName: toolName || 'unknown',
          arguments: (this.safeParse(args) ?? {}) as object,
          resultPreview: JSON.stringify(result ?? {}).slice(0, 500),
          success,
        },
      });
    } catch (error) {
      this.logger.warn('Không ghi được audit tool call', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async touchSession(
    sessionId: string,
    kind: 'customer' | 'admin',
    userId: string | null,
    needsHuman: boolean,
  ): Promise<void> {
    try {
      await this.prisma.aiSession.upsert({
        where: { sessionId },
        update: { needsHuman, ...(userId ? { userId } : {}) },
        create: { sessionId, kind, userId, needsHuman },
      });
    } catch (error) {
      this.logger.warn('Không cập nhật được phiên AI', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
