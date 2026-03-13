import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailService } from '../auth/services/email.service';

@Module({
  imports: [PrismaModule],
  controllers: [UsersController],
  providers: [UsersService, EmailService],
  exports: [UsersService]
})
export class UsersModule {}
