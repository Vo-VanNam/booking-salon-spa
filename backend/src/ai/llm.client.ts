import { BadGatewayException, HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { aiConfig } from '../common/config';
import { AppLogger } from '../common/logger';
import { ChatMessage, LlmResponse, ToolCall, ToolDefinition } from './ai.types';

/**
 * Client LLM tương thích OpenAI: gọi {AI_BASE_URL}/chat/completions (AI_BASE_URL đã bao gồm /v1).
 * Chạy hoàn toàn phía server — khoá AI không bao giờ đi ra client hay vào log.
 */
@Injectable()
export class LlmClient {
  private readonly logger = new AppLogger('ai.llm');

  private configOrFail() {
    const config = aiConfig();
    if (!config?.baseUrl) {
      throw new ServiceUnavailableException(
        'Trợ lý AI chưa được cấu hình. Bạn vẫn có thể đặt lịch bằng biểu mẫu hoặc gọi trực tiếp chi nhánh.',
      );
    }
    return config;
  }

  async chat(messages: ChatMessage[], tools: ToolDefinition[]): Promise<LlmResponse> {
    const config = this.configOrFail();
    const url = `${config.baseUrl}/chat/completions`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature: 0.2,
          stream: false,
          ...(tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
        }),
        signal: controller.signal,
      });

      const text = await response.text();
      if (!response.ok) {
        this.logger.error('Nhà cung cấp AI trả lỗi', undefined, { status: response.status, body: text.slice(0, 300) });
        throw new BadGatewayException('Dịch vụ AI đang gặp sự cố. Vui lòng thử lại sau ít phút.');
      }

      let payload: any;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new BadGatewayException('Dịch vụ AI trả về dữ liệu không hợp lệ. Vui lòng thử lại sau.');
      }

      const message = payload?.choices?.[0]?.message ?? {};
      const toolCalls: ToolCall[] = Array.isArray(message.tool_calls)
        ? message.tool_calls.map((call: any, index: number) => ({
            id: String(call?.id ?? `call_${index}`),
            type: 'function',
            function: {
              name: String(call?.function?.name ?? call?.name ?? ''),
              arguments:
                typeof call?.function?.arguments === 'string'
                  ? call.function.arguments
                  : JSON.stringify(call?.function?.arguments ?? call?.arguments ?? {}),
            },
          }))
        : [];

      // Tương thích cả định dạng function_call cũ.
      if (toolCalls.length === 0 && message.function_call?.name) {
        toolCalls.push({
          id: 'call_legacy',
          type: 'function',
          function: {
            name: String(message.function_call.name),
            arguments:
              typeof message.function_call.arguments === 'string'
                ? message.function_call.arguments
                : JSON.stringify(message.function_call.arguments ?? {}),
          },
        });
      }

      return {
        content: typeof message.content === 'string' ? message.content : null,
        tool_calls: toolCalls,
        finish_reason: payload?.choices?.[0]?.finish_reason,
        usage: payload?.usage,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('Không gọi được dịch vụ AI', undefined, {
        message: error instanceof Error ? error.message : String(error),
      });
      throw new BadGatewayException('Không kết nối được tới dịch vụ AI. Vui lòng thử lại sau.');
    } finally {
      clearTimeout(timer);
    }
  }
}
