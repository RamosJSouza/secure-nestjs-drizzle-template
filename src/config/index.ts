interface iConfig {
  env: string;
  port: number;
  app: {
    url: string;
  };
  keys: {
    privateKey: string;
    publicKey: string;
  };
  redis: {
    host: string;
    port: number;
    password: string | undefined;
  };
  rbac: {
    cacheTtl: number;
  };
  smtp: {
    host: string;
    port: number;
    user: string;
    pass: string;
    fromEmail: string;
    fromName: string;
  };
  tokens: {
    passwordResetTtlSeconds: number;
    emailVerificationTtlSeconds: number;
  };
  security: {
    passwordChangeGracePeriodHours: number;
    forgotPasswordMinResponseMs: number;
  };
}

export default (): Partial<iConfig> => ({
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  app: {
    url: (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, ''),
  },
  keys: {
    privateKey: (process.env.PRIVATE_KEY || '').replace(/\\n/gm, '\n'),
    publicKey: (process.env.PUBLIC_KEY || '').replace(/\\n/gm, '\n'),
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  rbac: {
    cacheTtl: parseInt(process.env.RBAC_CACHE_TTL || '300000', 10),
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    fromEmail: process.env.SMTP_FROM_EMAIL || 'noreply@localhost',
    fromName: process.env.SMTP_FROM_NAME || 'NestJS Security Pro',
  },
  tokens: {
    passwordResetTtlSeconds: parseInt(process.env.PASSWORD_RESET_TOKEN_TTL_SECONDS || '900', 10),
    emailVerificationTtlSeconds: parseInt(process.env.EMAIL_VERIFICATION_TOKEN_TTL_SECONDS || '86400', 10),
  },
  security: {
    passwordChangeGracePeriodHours: parseInt(process.env.PASSWORD_CHANGE_GRACE_PERIOD_HOURS || '24', 10),
    forgotPasswordMinResponseMs: parseInt(process.env.FORGOT_PASSWORD_MIN_RESPONSE_MS || '250', 10),
  },
});
