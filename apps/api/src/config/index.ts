import { z } from 'zod';

const configSchema = z.object({
  // Server
  port: z.number().default(4000),
  host: z.string().default('0.0.0.0'),
  env: z.enum(['development', 'production', 'test']).default('development'),
  
  // Database
  databaseUrl: z.string(),
  
  // Redis
  redisUrl: z.string().default('redis://localhost:6379'),
  
  // JWT
  jwt: z.object({
    secret: z.string(),
    expiresIn: z.string().default('15m'),
    refreshSecret: z.string(),
    refreshExpiresIn: z.string().default('7d'),
  }),
  
  // CORS
  cors: z.object({
    origin: z.union([z.string(), z.array(z.string())]).default('http://localhost:3000'),
  }),
  
  // Rate limiting
  rateLimit: z.object({
    windowMs: z.number().default(15 * 60 * 1000), // 15 minutes
    max: z.number().default(100), // requests per window
  }),
  
  // Email
  email: z.object({
    host: z.string().optional(),
    port: z.number().optional(),
    user: z.string().optional(),
    pass: z.string().optional(),
    from: z.string().default('noreply@aiwebsite.com'),
  }),
  
  // File upload
  upload: z.object({
    maxSize: z.number().default(10 * 1024 * 1024), // 10MB
    allowedTypes: z.array(z.string()).default(['image/jpeg', 'image/png', 'image/webp']),
  }),
  
  // External APIs
  apis: z.object({
    nvidia: z.object({
      apiKey: z.string().optional(),
      baseUrl: z.string().default('https://api.nvidia.com'),
    }),
    openai: z.object({
      apiKey: z.string().optional(),
      baseUrl: z.string().default('https://api.openai.com/v1'),
    }),
    stripe: z.object({
      secretKey: z.string().optional(),
      publishableKey: z.string().optional(),
      webhookSecret: z.string().optional(),
    }),
  }),
  
  // Browser automation
  browser: z.object({
    headless: z.boolean().default(true),
    timeout: z.number().default(30000),
    maxConcurrent: z.number().default(5),
  }),
  
  // Logging
  logging: z.object({
    level: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    file: z.boolean().default(true),
    console: z.boolean().default(true),
  }),
});

const createConfig = () => {
  const rawConfig = {
    port: parseInt(process.env.PORT || '4000'),
    host: process.env.HOST || '0.0.0.0',
    env: process.env.NODE_ENV || 'development',
    databaseUrl: process.env.DATABASE_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017/browser-ai-agent',
    redisUrl: process.env.REDIS_URL || process.env.REDIS_MASTER_URL || 'redis://localhost:6379',
    jwt: {
      secret: process.env.JWT_SECRET || 'enterprise-jwt-secret-superior-to-manus',
      expiresIn: process.env.JWT_EXPIRES_IN || '15m',
      refreshSecret: process.env.JWT_REFRESH_SECRET || 'enterprise-refresh-secret-superior-to-manus',
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    },
    cors: {
      origin: process.env.CORS_ORIGIN?.split(',') || 'http://localhost:3000',
    },
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
    },
    email: {
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT ? parseInt(process.env.EMAIL_PORT) : undefined,
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
      from: process.env.EMAIL_FROM || 'noreply@aiwebsite.com',
    },
    upload: {
      maxSize: parseInt(process.env.UPLOAD_MAX_SIZE || '10485760'), // 10MB
      allowedTypes: process.env.UPLOAD_ALLOWED_TYPES?.split(',') || ['image/jpeg', 'image/png', 'image/webp'],
    },
    apis: {
      nvidia: {
        apiKey: process.env.NVIDIA_API_KEY,
        baseUrl: process.env.NVIDIA_API_BASE_URL || 'https://api.nvidia.com',
      },
      openai: {
        apiKey: process.env.OPENAI_API_KEY,
        baseUrl: process.env.OPENAI_API_BASE_URL || 'https://api.openai.com/v1',
      },
      stripe: {
        secretKey: process.env.STRIPE_SECRET_KEY,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
      },
    },
    browser: {
      headless: process.env.BROWSER_HEADLESS !== 'false',
      timeout: parseInt(process.env.BROWSER_TIMEOUT || '30000'),
      maxConcurrent: parseInt(process.env.BROWSER_MAX_CONCURRENT || '5'),
    },
    logging: {
      level: (process.env.LOG_LEVEL as any) || 'info',
      file: process.env.LOG_FILE !== 'false',
      console: process.env.LOG_CONSOLE !== 'false',
    },
  };

  try {
    return configSchema.parse(rawConfig);
  } catch (error) {
    console.error('Invalid configuration:', error);
    process.exit(1);
  }
};

export const config = createConfig();

export type Config = z.infer<typeof configSchema>;