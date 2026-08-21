import { existsSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { RequestLoggingInterceptor } from './common/logging/request-logging.interceptor';
import helmet from 'helmet';
const cookieParser = require('cookie-parser');

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const logger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(logger);

  // Bảo mật HTTP headers (nới font/style cho latency tester UI)
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'style-src': ["'self'", 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
          'connect-src': ["'self'", 'https://profiles.uside.id.vn', 'http://127.0.0.1:3000'],
        },
      },
    }),
  );

  // Sử dụng cookie-parser
  app.use(cookieParser());

  // FE đo latency: /latency-tester/ (same-origin cookie khi chạy trên production)
  const latencyDir = join(process.cwd(), 'tools', 'api-latency');
  if (existsSync(latencyDir)) {
    app.useStaticAssets(latencyDir, {
      prefix: '/latency-tester',
      index: 'index.html',
    });
  }
  
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(app.get(RequestLoggingInterceptor), new ResponseInterceptor());

  const isProduction = process.env.NODE_ENV === 'production';

  app.enableCors({
    origin: isProduction
      ? [
          /^https:\/\/[^.]+\.uside\.studio$/,
          /^https:\/\/[^.]+\.uside\.id\.vn$/,
          /^https:\/\/.+\.vercel\.app$/,
          'https://profiles-uside-studio.vercel.app',
          'https://quizzes-uside-studio.vercel.app',
          'http://profiles.uside.id.vn',
          'https://profiles.uside.id.vn',
        ]
      : (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
          // Cho phép tất cả localhost và 127.0.0.1 ở mọi port khi development
          if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
            callback(null, true);
          } else {
            callback(new Error(`CORS blocked: ${origin}`));
          }
        },
    credentials: true,
  });
  
  const port = getRequiredPort();
  await app.listen(port);
  logger.log(`Application is running on port: ${port}`);
  if (existsSync(latencyDir)) {
    logger.log(`API Latency Lab: http://localhost:${port}/latency-tester/`);
  }
}

function getRequiredPort(): string {
  const port = process.env.PORT;

  if (!port) {
    throw new Error('PORT environment variable is required');
  }

  return port;
}

bootstrap();
