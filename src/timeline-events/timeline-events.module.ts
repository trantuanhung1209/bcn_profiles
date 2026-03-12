import { Module } from '@nestjs/common';
import { TimelineEventsService } from './timeline-events.service';
import { TimelineEventsController } from './timeline-events.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TimelineEventsController],
  providers: [TimelineEventsService],
  exports: [TimelineEventsService],
})
export class TimelineEventsModule {}
