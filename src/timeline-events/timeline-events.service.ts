import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTimelineEventDto } from './dto/create-timeline-event.dto';
import { UpdateTimelineEventDto } from './dto/update-timeline-event.dto';

@Injectable()
export class TimelineEventsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, createDto: CreateTimelineEventDto) {
    return this.prisma.timelineEvent.create({
      data: {
        userUuid: userId,
        eventType: createDto.eventType,
        title: createDto.title,
        metadata: createDto.metadata,
      },
    });
  }

  async findAllByUser(userId: string) {
    return this.prisma.timelineEvent.findMany({
      where: { userUuid: userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const event = await this.prisma.timelineEvent.findUnique({
      where: { id },
    });

    if (!event) {
      throw new NotFoundException(`Timeline event with ID ${id} not found`);
    }

    return event;
  }

  async update(
    id: number,
    userId: string,
    updateDto: UpdateTimelineEventDto,
  ) {
    const event = await this.findOne(id);

    // Kiểm tra xem event có thuộc về user không
    if (event.userUuid !== userId) {
      throw new ForbiddenException(
        'You can only update your own timeline events',
      );
    }

    return this.prisma.timelineEvent.update({
      where: { id },
      data: updateDto,
    });
  }

  async remove(id: number) {
    const event = await this.findOne(id);
    
    return this.prisma.timelineEvent.delete({
      where: { id },
    });
  }
}
