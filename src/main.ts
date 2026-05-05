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

  app.enableCors({
    origin: [/^https?:\/\/[^.]+\.uside\.studio$/, 'http://localhost:3000', 'http://localhost:5173', 'http://localhost:5500'],
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
