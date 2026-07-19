import { Module } from '@nestjs/common';
import { TimelineEventsService } from './timeline-events.service';
import { TimelineEventsController } from './timeline-events.controller';
import { TimelineEventsCacheService } from './timeline-events-cache.service';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [PrismaModule, UsersModule],
  controllers: [TimelineEventsController],
  providers: [TimelineEventsService, TimelineEventsCacheService],
  exports: [TimelineEventsService, TimelineEventsCacheService],
})
export class TimelineEventsModule {}
