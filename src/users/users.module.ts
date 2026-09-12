import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersListCacheService } from './users-list-cache.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { MinioService } from '../common/storage/minio.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [UsersController],
  providers: [UsersService, UsersListCacheService, MinioService],
  exports: [UsersService, UsersListCacheService],
})
export class UsersModule {}
