import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ValidationError } from 'class-validator';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

const FIELD_LABELS: Record<string, string> = {
  email: 'Email',
  password: 'Mật khẩu',
  phone: 'Số điện thoại',
  name: 'Tên',
  fullName: 'Họ và tên',
  branchId: 'Chi nhánh',
  serviceId: 'Dịch vụ',
  stylistId: 'Stylist',
  startTime: 'Thời gian bắt đầu',
  endTime: 'Thời gian kết thúc',
  date: 'Ngày',
  durationMinutes: 'Thời lượng',
  status: 'Trạng thái',
  role: 'Vai trò',
  price: 'Giá',
  address: 'Địa chỉ',
  description: 'Mô tả',
  note: 'Ghi chú',
};

const CONSTRAINT_MESSAGES: Record<string, string> = {
  isNotEmpty: 'Trường này không được để trống',
  isEmail: 'Định dạng email không hợp lệ',
  isString: 'Phải là chuỗi ký tự',
  isNumber: 'Phải là số',
  isInt: 'Phải là số nguyên',
  isBoolean: 'Phải là giá trị đúng hoặc sai',
  isDateString: 'Định dạng ngày giờ không hợp lệ',
  isEnum: 'Giá trị không hợp lệ',
  isUUID: 'Định dạng mã không hợp lệ',
  isPhoneNumber: 'Số điện thoại không hợp lệ',
  minLength: 'Độ dài tối thiểu không đạt yêu cầu',
  maxLength: 'Độ dài vượt quá giới hạn cho phép',
  min: 'Giá trị nhỏ hơn mức tối thiểu',
  max: 'Giá trị lớn hơn mức tối đa',
  matches: 'Định dạng không hợp lệ',
  isISO8601: 'Định dạng ngày giờ không hợp lệ',
  isArray: 'Danh sách không hợp lệ',
  isIn: 'Giá trị không hợp lệ',
};

function formatValidationErrors(errors: ValidationError[]): string {
  return errors
    .map((error) => {
      const label = FIELD_LABELS[error.property] ?? error.property;
      const messages = error.constraints
        ? Object.entries(error.constraints).map(([constraint, message]) =>
            /^[a-z]/.test(message)
              ? (CONSTRAINT_MESSAGES[constraint] ?? 'Giá trị không hợp lệ')
              : message,
          )
        : ['Giá trị không hợp lệ'];
      return `${label}: ${messages.join(', ')}`;
    })
    .join('; ');
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.use(helmet());
  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN') ?? 'http://localhost:3000',
    credentials: true,
  });

  app.useGlobalFilters(new AllExceptionsFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      exceptionFactory: (errors) =>
        new BadRequestException(formatValidationErrors(errors)),
    }),
  );

  await app.listen(config.get<number>('PORT') ?? 3001);
}

void bootstrap();
