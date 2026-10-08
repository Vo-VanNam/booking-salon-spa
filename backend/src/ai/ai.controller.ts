import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { AuthUser, CurrentUser, Public, Roles } from '../auth/auth.decorators';
import { RateLimit } from '../common/rate-limit.guard';
import { AiService } from './ai.service';
import { AiChatDto } from './dto/ai-chat.dto';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  /**
   * Widget chat của khách (DOCUMENT.md §2.8). Rate limit riêng: 30 request/60s cho mỗi client —
   * request thứ 31 trong cùng cửa sổ nhận 429.
   */
  @Public()
  @Post('chat')
  @HttpCode(200)
  @RateLimit({ key: 'ai-chat', limit: 30, windowSeconds: 60 })
  chat(@Body() dto: AiChatDto) {
    return this.aiService.chat({ message: dto.message, sessionId: dto.session_id });
  }

  /** Trợ lý phân tích cho admin (DOCUMENT.md §2.9) — phạm vi chi nhánh do server quyết định. */
  @Roles('super_admin', 'branch_admin')
  @Post('admin-chat')
  @HttpCode(200)
  @RateLimit({ key: 'ai-admin-chat', limit: 30, windowSeconds: 60, by: 'user' })
  adminChat(@CurrentUser() user: AuthUser, @Body() dto: AiChatDto) {
    return this.aiService.adminChat(user, { message: dto.message, sessionId: dto.session_id });
  }

  @Roles('super_admin', 'branch_admin')
  @Get('sessions')
  sessions(@Query('needs_human') needsHuman?: string) {
    return this.aiService.listSessions(needsHuman === 'true');
  }

  @Roles('super_admin', 'branch_admin')
  @Get('tool-calls')
  toolCalls(@Query('session_id') sessionId: string) {
    return this.aiService.toolCallLog(sessionId);
  }
}
