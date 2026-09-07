import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTimelineEventDto } from './dto/create-timeline-event.dto';
import { UpdateTimelineEventDto } from './dto/update-timeline-event.dto';
import { UsersListCacheService } from '../users/users-list-cache.service';
import { TimelineEventsCacheService } from './timeline-events-cache.service';
import { Role } from '../auth/enums/role.enum';

@Injectable()
export class TimelineEventsService implements OnModuleInit {
  private readonly logger = new Logger(TimelineEventsService.name);

  constructor(
    private prisma: PrismaService,
    private readonly usersListCache: UsersListCacheService,
    private readonly timelineCache: TimelineEventsCacheService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.prefetchHotTimelines();
  }

  /** Warm common my-timeline pages for admins and recently active users. */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async prefetchHotTimelines(): Promise<void> {
    try {
      const [admins, recentActive] = await Promise.all([
        this.prisma.user.findMany({
          where: { role: 'ADMIN' },
          select: { id: true },
          take: 20,
        }),
        this.prisma.user.findMany({
          where: { status: 'ACTIVE', role: { not: 'ADMIN' } },
          select: { id: true },
          orderBy: { updatedAt: 'desc' },
          take: 10,
        }),
      ]);

      const userIds = [...new Set([...admins, ...recentActive].map((user) => user.id))];

      // Small concurrency to warm cache without saturating the remote DB pool.
      const batchSize = 5;
      for (let i = 0; i < userIds.length; i += batchSize) {
        const batch = userIds.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (userId) => {
            const page = await this.queryAllByUser(userId, 1, 20);
            await this.timelineCache.setList(userId, 1, 20, page);
            for (const event of page) {
              await this.timelineCache.setDetail(event.id, event);
            }
          }),
        );
      }

      this.logger.debug(`Prefetched timelines for ${userIds.length} user(s)`);
    } catch (error) {
      this.logger.warn(
        `Failed to prefetch timelines: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async create(userId: string, createDto: CreateTimelineEventDto) {
    const created = await this.prisma.timelineEvent.create({
      data: {
        userUuid: userId,
        eventType: createDto.eventType,
        title: createDto.title,
        metadata: createDto.metadata,
      },
    });
    await this.invalidateCaches(userId);
    return created;
  }

  async findAllByUser(userId: string, page: number = 1, limit: number = 20) {
    const cached = await this.timelineCache.getList(userId, page, limit);
    if (cached) {
      return cached;
    }

    const events = await this.queryAllByUser(userId, page, limit);
    await this.timelineCache.setList(userId, page, limit, events);
    for (const event of events) {
      await this.timelineCache.setDetail(event.id, event);
    }
    return events;
  }

  async findOne(id: number, requesterId?: string, requesterRole?: string) {
    const cached = await this.timelineCache.getDetail(id);
    if (cached) {
      this.assertCanViewTimelineEvent(cached as { userUuid: string }, requesterId, requesterRole);
      return cached;
    }

    const event = await this.prisma.timelineEvent.findUnique({
      where: { id },
    });

    if (!event) {
      throw new NotFoundException(`Timeline event with ID ${id} not found`);
    }

    this.assertCanViewTimelineEvent(event, requesterId, requesterRole);
    await this.timelineCache.setDetail(id, event);
    return event;
  }

  private assertCanViewTimelineEvent(
    event: { userUuid: string },
    requesterId?: string,
    requesterRole?: string,
  ) {
    if (!requesterId) {
      return;
    }
    if (event.userUuid !== requesterId && requesterRole !== Role.ADMIN) {
      throw new ForbiddenException('You can only view your own timeline events');
    }
  }

  async update(
    id: number,
    userId: string,
    updateDto: UpdateTimelineEventDto,
  ) {
    const event = await this.findOne(id, userId) as { userUuid: string };

    if (event.userUuid !== userId) {
      throw new ForbiddenException(
        'You can only update your own timeline events',
      );
    }

    const updated = await this.prisma.timelineEvent.update({
      where: { id },
      data: updateDto,
    });
    await this.invalidateCaches(userId);
    return updated;
  }

  async remove(id: number) {
    const event = await this.findOne(id) as { userUuid: string; id: number };

    const removed = await this.prisma.timelineEvent.delete({
      where: { id },
    });
    await this.invalidateCaches(event.userUuid);
    return removed;
  }

  private async queryAllByUser(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;
    return this.prisma.timelineEvent.findMany({
      where: { userUuid: userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });
  }

  private async invalidateCaches(userId: string): Promise<void> {
    await this.timelineCache.invalidateUser(userId);
    await this.usersListCache.invalidateAll();
  }
}
