import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Transporter } from 'nodemailer';
import { MailService } from './mail.service';

describe('MailService', () => {
  const configOf = (values: Record<string, unknown>): ConfigService =>
    ({
      get: jest.fn((key: string) => values[key]),
    }) as unknown as ConfigService;

  it('SMTP_HOST rỗng → chỉ log, không gọi sendMail (dev mode)', async () => {
    const logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const transporter = { sendMail: jest.fn() };
    const service = new MailService(
      configOf({ SMTP_HOST: '' }),
      transporter as unknown as Transporter,
    );

    await service.send({
      to: 'a@example.com',
      subject: 'Nhắc lịch hẹn - Salon Sài Gòn',
      html: '<p>Nhắc lịch: test</p>',
    });

    expect(transporter.sendMail).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('SMTP_HOST có giá trị → gọi transporter.sendMail với SMTP_FROM', async () => {
    const transporter = { sendMail: jest.fn() };
    const service = new MailService(
      configOf({
        SMTP_HOST: 'smtp.example.com',
        SMTP_FROM: 'salon@example.com',
      }),
      transporter as unknown as Transporter,
    );

    await service.send({
      to: 'a@example.com',
      subject: 'Nhắc lịch hẹn - Salon Sài Gòn',
      html: '<p>Nhắc lịch: test</p>',
    });

    expect(transporter.sendMail).toHaveBeenCalledWith({
      from: 'salon@example.com',
      to: 'a@example.com',
      subject: 'Nhắc lịch hẹn - Salon Sài Gòn',
      html: '<p>Nhắc lịch: test</p>',
    });
  });
});
