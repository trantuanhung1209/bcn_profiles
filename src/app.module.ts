import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { WinstonModule } from 'nest-winston';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CatsModule } from './cats/cats.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { TimelineEventsModule } from './timeline-events/timeline-events.module';
import { RequestLoggingInterceptor } from './common/logging/request-logging.interceptor';
import { createWinstonLoggerOptions } from './common/logging/winston.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'production' ? '.env.production' : '.env',
    }),
    WinstonModule.forRoot(createWinstonLoggerOptions(process.env.SERVICE_NAME ?? 'profile_api')),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,   // 1 phút
        limit: 60,    // 60 request/phút (mặc định toàn app)
      },
    ]),
    ScheduleModule.forRoot(),
    CatsModule,
    PrismaModule,
    UsersModule,
    AuthModule,
    TimelineEventsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    RequestLoggingInterceptor,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
