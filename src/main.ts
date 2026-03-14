import 'dotenv/config'; 
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  app.enableShutdownHooks();

  try {
    const configService = app.get(ConfigService);
    const nodeEnv = configService.get<string>('NODE_ENV', 'development');

    app.getHttpAdapter().getInstance().set('trust proxy', 1);

    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: nodeEnv === 'production' ? ["'self'"] : ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
            frameAncestors: ["'none'"],  
            baseUri: ["'self'"],
            formAction: ["'self'"],
            ...(nodeEnv === 'production' && { upgradeInsecureRequests: [] }),
          },
        },
        hsts: nodeEnv === 'production'
          ? { maxAge: 31536000, includeSubDomains: true, preload: true }
          : false,
        crossOriginEmbedderPolicy: nodeEnv === 'production',
        crossOriginOpenerPolicy: { policy: 'same-origin' },
        crossOriginResourcePolicy: { policy: 'same-site' },
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
        noSniff: true,                          
        xssFilter: true,                       
        frameguard: { action: 'deny' },         
        dnsPrefetchControl: { allow: false },   
        permittedCrossDomainPolicies: { permittedPolicies: 'none' },
        hidePoweredBy: true,                    
      }),
    );

    const originsRaw = configService.get<string>('ALLOWED_ORIGINS', '');
    const parsedOrigins = originsRaw
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    const corsOrigin: string[] | boolean =
      parsedOrigins.length > 0 ? parsedOrigins : nodeEnv !== 'production';

    app.enableCors({
      origin: corsOrigin,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Correlation-Id'],
    });

    app.use(
      rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 300,
        standardHeaders: true,
        legacyHeaders: false,
        message: 'Too many requests from this IP, please try again after 15 minutes',
        skip: (req) => req.path === '/health/liveness' || req.path === '/health/readiness',
      }),
    );

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    if (nodeEnv !== 'production') {
      const config = new DocumentBuilder()
        .setTitle('NestJS Security Pro API')
        .setDescription('Enterprise RBAC Administration System')
        .setVersion('1.0.0')
        .addBearerAuth()
        .addTag('auth')
        .addTag('Users')
        .addTag('Roles')
        .addTag('Features')
        .build();

      const document = SwaggerModule.createDocument(app, config);
      SwaggerModule.setup('api/docs', app, document);
    }

    const port = configService.get<number>('port') ?? configService.get<number>('PORT') ?? 3000;
    await app.listen(port);

    const logger = app.get(Logger);
    logger.log(`Application is running on: http://localhost:${port}`, 'Bootstrap');
    if (nodeEnv !== 'production') {
      logger.log(`Swagger Documentation: http://localhost:${port}/api/docs`, 'Bootstrap');
    }
  } catch (error) {
    const logger = app.get(Logger);
    logger.error(
      'Error during application bootstrap',
      error instanceof Error ? error.stack : String(error),
      'Bootstrap',
    );
    process.exit(1);
  }
}

bootstrap();
