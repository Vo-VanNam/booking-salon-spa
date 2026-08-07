import Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().integer().positive().default(3001),
  DATABASE_URL: Joi.string()
    .pattern(/^postgres(ql)?:\/\//)
    .required(),
  REDIS_URL: Joi.string()
    .pattern(/^redis:\/\//)
    .required(),
  CORS_ORIGIN: Joi.string().default('http://localhost:3000'),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL: Joi.number().integer().positive().default(900),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  THROTTLE_TTL: Joi.number().integer().positive().default(60000),
  THROTTLE_LIMIT: Joi.number().integer().positive().default(100),
  // Thanh toán: PAYMENT_ENABLED=false (mặc định) là hợp lệ - chua co key van
  // boot duoc; khi bat true moi can du key (PaymentService tu kiem tra).
  PAYMENT_ENABLED: Joi.string().valid('true', 'false').default('false'),
  DEPOSIT_PERCENT: Joi.number().integer().min(1).max(100).default(30),
  VNP_TMN_CODE: Joi.string().allow(''),
  VNP_HASH_SECRET: Joi.string().allow(''),
  VNP_URL: Joi.string().allow(''),
  VNP_RETURN_URL: Joi.string().allow(''),
  VNP_IPN_URL: Joi.string().allow(''),
  MOMO_PARTNER_CODE: Joi.string().allow(''),
  MOMO_ACCESS_KEY: Joi.string().allow(''),
  MOMO_SECRET_KEY: Joi.string().allow(''),
  MOMO_API_URL: Joi.string().allow(''),
  MOMO_REDIRECT_URL: Joi.string().allow(''),
  MOMO_IPN_URL: Joi.string().allow(''),
  // Nhap lich: SMTP cho email, SMS_* cho SMS (thieu SMS_* -> LogSmsProvider)
  SMTP_HOST: Joi.string().allow(''),
  SMTP_PORT: Joi.number().integer().positive().allow(null).allow(''),
  SMTP_USER: Joi.string().allow(''),
  SMTP_PASS: Joi.string().allow(''),
  SMTP_FROM: Joi.string().allow(''),
  SMS_API_URL: Joi.string().allow(''),
  SMS_API_KEY: Joi.string().allow(''),
  SMS_SENDER: Joi.string().allow(''),
});

export const configuration = () => ({
  port: parseInt(process.env.PORT ?? '3001', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessTtl: parseInt(process.env.JWT_ACCESS_TTL ?? '900', 10),
    refreshSecret: process.env.JWT_REFRESH_SECRET,
  },
  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL ?? '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),
  },
});
