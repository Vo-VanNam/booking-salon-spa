import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;

  constructor(
    private readonly config: ConfigService,
    // Transporter tùy chọn để test; khi không inject, paramtypes là Object nên
    // bắt buộc @Optional để Nest không throw khi resolve dependency
    @Optional() transporter?: Transporter,
  ) {
    const host = config.get<string>('SMTP_HOST') ?? '';
    if (!host) {
      // Chua cau hinh SMTP -> chi log, khong gui that (dev mode)
      this.transporter = null;
      return;
    }
    this.transporter =
      transporter ??
      nodemailer.createTransport({
        host,
        port: Number(config.get<number>('SMTP_PORT') ?? 587),
        auth: {
          user: config.get<string>('SMTP_USER') ?? '',
          pass: config.get<string>('SMTP_PASS') ?? '',
        },
      });
  }

  async send(params: {
    to: string;
    subject: string;
    html: string;
  }): Promise<void> {
    if (!this.transporter) {
      this.logger.log(
        JSON.stringify({
          tag: '[MAIL]',
          to: params.to,
          subject: params.subject,
          html: params.html,
        }),
      );
      return;
    }
    await this.transporter.sendMail({
      from: this.config.get<string>('SMTP_FROM') ?? '',
      ...params,
    });
  }
}
