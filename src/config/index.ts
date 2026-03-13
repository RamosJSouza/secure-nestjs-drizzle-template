interface iConfig {
  env: string;
  port: number;
  keys: {
    privateKey: string;
    publicKey: string;
  };
  redis: {
    host: string;
    port: number;
    password: string | undefined;
  };
}

export default (): Partial<iConfig> => ({
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  keys: {
    privateKey: (process.env.PRIVATE_KEY || '').replace(/\\n/gm, '\n'),
    publicKey: (process.env.PUBLIC_KEY || '').replace(/\\n/gm, '\n'),
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
});
