import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { RequestLoggingInterceptor } from './common/logging/request-logging.interceptor';
import helmet from 'helmet';
const cookieParser = require('cookie-parser');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(logger);

  // Bảo mật HTTP headers
  app.use(helmet());

  // Sử dụng cookie-parser
  app.use(cookieParser());
  
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
          /^https:\/\/.+\.vercel\.app$/,
          'https://profiles-uside-studio.vercel.app',
          'https://quizzes-uside-studio.vercel.app',
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
}

function getRequiredPort(): string {
  const port = process.env.PORT;

  if (!port) {
    throw new Error('PORT environment variable is required');
  }

  return port;
}

bootstrap();
