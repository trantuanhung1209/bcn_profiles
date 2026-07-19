import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTimelineEventDto } from './dto/create-timeline-event.dto';
import { UpdateTimelineEventDto } from './dto/update-timeline-event.dto';
import { UsersListCacheService } from '../users/users-list-cache.service';

@Injectable()
export class TimelineEventsService {
  constructor(
    private prisma: PrismaService,
    private readonly usersListCache: UsersListCacheService,
  ) {}

  async create(userId: string, createDto: CreateTimelineEventDto) {
    const created = await this.prisma.timelineEvent.create({
      data: {
        userUuid: userId,
        eventType: createDto.eventType,
        title: createDto.title,
        metadata: createDto.metadata,
      },
    });
    this.usersListCache.invalidateAll();
    return created;
  }

  async findAllByUser(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    return this.prisma.timelineEvent.findMany({
      where: { userUuid: userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
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

    const updated = await this.prisma.timelineEvent.update({
      where: { id },
      data: updateDto,
    });
    this.usersListCache.invalidateAll();
    return updated;
  }

  async remove(id: number) {
    const event = await this.findOne(id);

    const removed = await this.prisma.timelineEvent.delete({
      where: { id },
    });
    this.usersListCache.invalidateAll();
    return removed;
  }
}
