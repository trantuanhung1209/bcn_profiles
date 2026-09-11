import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersListCacheService } from './users-list-cache.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { CloudinaryService } from '../common/storage/cloudinary.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [UsersController],
  providers: [UsersService, UsersListCacheService, CloudinaryService],
  exports: [UsersService, UsersListCacheService],
})
export class UsersModule {}
