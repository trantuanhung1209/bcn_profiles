import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { WinstonModule } from 'nest-winston';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { createRedisClient } from './redis/redis.factory';
import { RedisModule } from './redis/redis.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { TimelineEventsModule } from './timeline-events/timeline-events.module';
import { HttpExceptionEnvelopeFilter } from './common/filters/http-exception-envelope.filter';
import { RequestLoggingInterceptor } from './common/logging/request-logging.interceptor';
import { createWinstonLoggerOptions } from './common/logging/winston.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'production' ? '.env.production' : '.env',
    }),
    WinstonModule.forRoot(createWinstonLoggerOptions(process.env.SERVICE_NAME ?? 'profile_api')),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const prefix =
          config.get<string>('REDIS_KEY_PREFIX')?.trim() || 'bcn:profiles:';
        const redis = createRedisClient(config, {
          keyPrefix: `${prefix}throttler:`,
          lazyConnect: false,
        });
        return {
          throttlers: [
            {
              name: 'default',
              ttl: 60_000,
              limit: 300,
            },
          ],
          storage: new ThrottlerStorageRedisService(redis),
        };
      },
    }),
    ScheduleModule.forRoot(),
    RedisModule,
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
      provide: APP_FILTER,
      useClass: HttpExceptionEnvelopeFilter,
    },
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
