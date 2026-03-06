import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
const cookieParser = require('cookie-parser');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Enable graceful shutdown
  
  // Sử dụng cookie-parser
  app.use(cookieParser());
  
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalInterceptors(new ResponseInterceptor());

  app.enableCors();
  
  await app.listen(3000);
  console.log(`🚀 Application is running on: http://localhost:3000`);
}
bootstrap();
