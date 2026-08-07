import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SmsProvider {
  send(params: {
    phone: string;
    message: string;
    sender?: string;
  }): Promise<void>;
}

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

// Log-only provider khi chua cau hinh SMS_API_URL / SMS_API_KEY (dev mode)
export class LogSmsProvider implements SmsProvider {
  private readonly logger = new Logger(LogSmsProvider.name);

  send(params: {
    phone: string;
    message: string;
    sender?: string;
  }): Promise<void> {
    this.logger.log(
      JSON.stringify({
        tag: '[SMS]',
        phone: params.phone,
        message: params.message,
        sender: params.sender,
      }),
    );
    return Promise.resolve();
  }
}

export class HttpSmsProvider implements SmsProvider {
  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
    private readonly sender?: string,
  ) {}

  async send(params: {
    phone: string;
    message: string;
    sender?: string;
  }): Promise<void> {
    const res = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify({
        phone: params.phone,
        message: params.message,
        ...(this.sender ? { sender: this.sender } : {}),
      }),
    });
    if (!res.ok) throw new Error(`SMS API error: HTTP ${res.status}`);
  }
}

export const smsProviderFactory = (config: ConfigService): SmsProvider => {
  const apiUrl = config.get<string>('SMS_API_URL');
  const apiKey = config.get<string>('SMS_API_KEY');
  if (apiUrl && apiKey)
    return new HttpSmsProvider(
      apiUrl,
      apiKey,
      config.get<string>('SMS_SENDER') ?? undefined,
    );
  return new LogSmsProvider();
};
