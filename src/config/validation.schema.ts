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
}).options({
  allowUnknown: true,
  stripUnknown: true,
  abortEarly: false,
});
