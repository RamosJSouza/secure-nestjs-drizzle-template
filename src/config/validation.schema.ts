import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  PORT: Joi.number().default(3000),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_DATABASE: Joi.string().required(),

  PRIVATE_KEY: Joi.string()
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.string().min(1).messages({
        'string.min': 'PRIVATE_KEY must not be empty when NODE_ENV=production',
      }),
      otherwise: Joi.string().allow(''),
    })
    .required(),

  PUBLIC_KEY: Joi.string()
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.string().min(1).messages({
        'string.min': 'PUBLIC_KEY must not be empty when NODE_ENV=production',
      }),
      otherwise: Joi.string().allow(''),
    })
    .required(),

  DB_SSL: Joi.string()
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.string().valid('true').required().messages({
        'any.only': 'DB_SSL must be "true" when NODE_ENV=production',
      }),
      otherwise: Joi.string().valid('true', 'false').optional(),
    }),

  ALLOWED_ORIGINS: Joi.string()
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.string()
        .pattern(/^https?:\/\/.+(,https?:\/\/.+)*$/)
        .required()
        .messages({
          'any.required': 'ALLOWED_ORIGINS is required when NODE_ENV=production',
          'string.pattern.base': 'ALLOWED_ORIGINS must be comma-separated URLs (e.g. https://admin.example.com)',
        }),
      otherwise: Joi.string().optional().allow(''),
    }),

  REDIS_HOST: Joi.string().optional().default('localhost'),
  REDIS_PORT: Joi.number().optional().default(6379),
  REDIS_PASSWORD: Joi.string().optional().allow(''),
  RBAC_CACHE_TTL: Joi.number().optional().default(300000),
  DISABLE_REDIS: Joi.string().valid('true', 'false').optional().default('true'),

  APP_URL: Joi.string()
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.string().uri().required(),
      otherwise: Joi.string().uri().optional().default('http://localhost:3000'),
    }),

  SMTP_HOST: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(1).required(),
    otherwise: Joi.string().optional().allow(''),
  }),
  SMTP_PORT: Joi.number().optional().default(587),
  SMTP_USER: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(1).required(),
    otherwise: Joi.string().optional().allow(''),
  }),
  SMTP_PASS: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(1).required(),
    otherwise: Joi.string().optional().allow(''),
  }),
  SMTP_FROM_EMAIL: Joi.string().email().optional().default('noreply@localhost'),
  SMTP_FROM_NAME: Joi.string().optional().default('NestJS Security Pro'),

  PASSWORD_RESET_TOKEN_TTL_SECONDS: Joi.number().optional().default(900),
  EMAIL_VERIFICATION_TOKEN_TTL_SECONDS: Joi.number().optional().default(86400),
  PASSWORD_CHANGE_GRACE_PERIOD_HOURS: Joi.number().optional().default(24),
  FORGOT_PASSWORD_MIN_RESPONSE_MS: Joi.number().optional().default(250),
}).options({
  allowUnknown: true,
  stripUnknown: true,
  abortEarly: false,
});
