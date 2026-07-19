import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { User, UserStatus } from 'prisma/client/client';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { EmailService } from '../auth/services/email.service';
import { AuthSessionCacheService } from '../auth/services/auth-session-cache.service';
import { UsersListCacheService } from './users-list-cache.service';

export type UserWithoutPassword = Omit<User, 'password' | 'twoFactorEnabled' | 'twoFactorRequired' | 'totpSecret' | 'twoFactorRecoveryCodes'>;

export type SortableUserFields =
  | 'id'
  | 'email'
  | 'fullName'
  | 'createdAt'
  | 'updatedAt'
  | 'role'
  | 'isOnline'
  | 'lastSeen';

export type SortOrder = 'asc' | 'desc';

export interface PaginatedUsers {
  data: UserWithoutPassword[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const USER_LIST_SELECT = {
  id: true,
  email: true,
  fullName: true,
  avatar: true,
  phone: true,
  metadata: true,
  role: true,
  status: true,
  googleId: true,
  typeAuth: true,
  createdAt: true,
  updatedAt: true,
  password: false,
  timelineEvents: {
    orderBy: {
      createdAt: 'desc' as const,
    },
    take: 5,
    select: {
      id: true,
      eventType: true,
      title: true,
      metadata: true,
      createdAt: true,
    },
  },
} as const;

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private readonly sessionCache: AuthSessionCacheService,
    private readonly listCache: UsersListCacheService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.prefetchHotUserLists();
  }

  /** Keep common admin read endpoints warm so the first browser hit is a cache hit. */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async prefetchHotUserLists(): Promise<void> {
    try {
      // Match QueryUsersDto defaults (sort=createdAt, order=desc) plus common UI sorts.
      const hotQueries: Array<{
        scope: 'all' | 'pending';
        page: number;
        limit: number;
        sort: SortableUserFields;
        order: SortOrder;
      }> = [
        { scope: 'all', page: 1, limit: 10, sort: 'fullName', order: 'asc' },
        { scope: 'all', page: 1, limit: 10, sort: 'fullName', order: 'desc' },
        { scope: 'all', page: 1, limit: 10, sort: 'createdAt', order: 'desc' },
        { scope: 'all', page: 1, limit: 10, sort: 'createdAt', order: 'asc' },
        { scope: 'all', page: 2, limit: 10, sort: 'fullName', order: 'asc' },
        { scope: 'pending', page: 1, limit: 10, sort: 'createdAt', order: 'desc' },
        { scope: 'pending', page: 1, limit: 10, sort: 'createdAt', order: 'asc' },
        { scope: 'pending', page: 1, limit: 10, sort: 'fullName', order: 'asc' },
      ];

      const pages = await Promise.all(
        hotQueries.map(async (query) => {
          const result =
            query.scope === 'pending'
              ? await this.queryPendingPage(query.page, query.limit, query.sort, query.order)
              : await this.queryAllPage(query.page, query.limit, query.sort, query.order);
          this.listCache.setPage(this.listCache.buildPageKey({ ...query }), result);
          return { query, result };
        }),
      );

      const count = await this.queryCount();
      this.listCache.setCount(count);

      // Warm details/profiles for likely first-click rows + admins (often opened immediately).
      const userIds = new Set<string>();
      for (const { query, result } of pages) {
        const isPrimary =
          (query.scope === 'all' && query.sort === 'fullName' && query.order === 'asc' && query.page === 1) ||
          (query.scope === 'pending' && query.sort === 'createdAt' && query.order === 'desc' && query.page === 1);
        if (!isPrimary) continue;
        for (const row of result.data) {
          const id = (row as { id?: string }).id;
          if (id) userIds.add(id);
        }
      }

      const admins = await this.prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: { id: true },
        take: 20,
      });
      for (const admin of admins) {
        userIds.add(admin.id);
      }

      for (const id of userIds) {
        const [detail, profile] = await Promise.all([
          this.queryFindOne(id),
          this.queryPublicProfile(id),
        ]);
        if (detail) {
          this.listCache.setDetail(id, detail);
          this.listCache.setByEmail(detail.email, detail);
        }
        if (profile) {
          this.listCache.setProfile(id, profile);
        }
      }

      this.logger.debug(
        `Prefetched users read cache: ${pages.length} pages, count, ${userIds.size} details/profiles`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to prefetch user reads: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async findPending(
    page: number = 1,
    limit: number = 10,
    sort: SortableUserFields = 'createdAt',
    order: SortOrder = 'desc',
    search?: string,
  ): Promise<PaginatedUsers> {
    const cacheKey = this.listCache.buildPageKey({
      scope: 'pending',
      page,
      limit,
      sort,
      order,
      search,
    });
    const cached = this.listCache.getPage(cacheKey);
    if (cached) {
      return cached as PaginatedUsers;
    }

    const result = await this.queryPendingPage(page, limit, sort, order, search);
    this.listCache.setPage(cacheKey, result);
    return result;
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    sort: SortableUserFields = 'createdAt',
    order: SortOrder = 'desc',
    search?: string,
  ): Promise<PaginatedUsers> {
    const cacheKey = this.listCache.buildPageKey({
      scope: 'all',
      page,
      limit,
      sort,
      order,
      search,
    });
    const cached = this.listCache.getPage(cacheKey);
    if (cached) {
      return cached as PaginatedUsers;
    }

    const result = await this.queryAllPage(page, limit, sort, order, search);
    this.listCache.setPage(cacheKey, result);
    return result;
  }

  private async queryPendingPage(
    page: number,
    limit: number,
    sort: SortableUserFields,
    order: SortOrder,
    search?: string,
  ): Promise<PaginatedUsers> {
    const skip = (page - 1) * limit;
    const normalizedSearch = search?.trim();
    const where = {
      status: UserStatus.PENDING,
      ...(normalizedSearch
        ? {
            OR: [
              { fullName: { contains: normalizedSearch, mode: 'insensitive' as const } },
              { email: { contains: normalizedSearch, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        relationLoadStrategy: 'join',
        where,
        skip,
        take: limit,
        select: USER_LIST_SELECT,
        orderBy: { [sort]: order },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  private async queryAllPage(
    page: number,
    limit: number,
    sort: SortableUserFields,
    order: SortOrder,
    search?: string,
  ): Promise<PaginatedUsers> {
    const skip = (page - 1) * limit;
    const normalizedSearch = search?.trim();
    const where = normalizedSearch
      ? {
          OR: [
            { fullName: { contains: normalizedSearch, mode: 'insensitive' as const } },
            { email: { contains: normalizedSearch, mode: 'insensitive' as const } },
          ],
        }
      : undefined;

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        relationLoadStrategy: 'join',
        where,
        skip,
        take: limit,
        select: USER_LIST_SELECT,
        orderBy: {
          [sort]: order,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  private invalidateListCaches(): void {
    this.listCache.invalidateAll();
  }

  async findOne(id: string): Promise<UserWithoutPassword> {
    const cached = this.listCache.getDetail(id);
    if (cached) {
      return cached as UserWithoutPassword;
    }

    const user = await this.queryFindOne(id);
    if (!user) {
      throw new NotFoundException(`User với ID ${id} không tồn tại`);
    }

    this.listCache.setDetail(id, user);
    this.listCache.setByEmail(user.email, user);
    return user;
  }

  async getPublicProfile(id: string) {
    const cached = this.listCache.getProfile(id);
    if (cached) {
      return cached;
    }

    const user = await this.queryPublicProfile(id);
    if (!user) {
      throw new NotFoundException(`User với ID ${id} không tồn tại`);
    }

    this.listCache.setProfile(id, user);
    return user;
  }

  async findByEmail(email: string): Promise<UserWithoutPassword | null> {
    const cached = this.listCache.getByEmail(email);
    if (cached !== undefined) {
      return cached as UserWithoutPassword | null;
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        fullName: true,
        avatar: true,
        phone: true,
        metadata: true,
        role: true,
        status: true,
        googleId: true,
        typeAuth: true,
        createdAt: true,
        updatedAt: true,
        password: false,
      },
    });

    this.listCache.setByEmail(email, user);
    if (user) {
      // Detail cache may be richer later; email lookup still benefits immediately.
      this.listCache.setDetail(user.id, user);
    }
    return user;
  }

  async countUsers(): Promise<number> {
    const cached = this.listCache.getCount();
    if (cached !== undefined) {
      return cached;
    }

    const count = await this.queryCount();
    this.listCache.setCount(count);
    return count;
  }

  private async queryCount(): Promise<number> {
    return this.prisma.user.count();
  }

  private async queryFindOne(id: string): Promise<UserWithoutPassword | null> {
    return this.prisma.user.findUnique({
      relationLoadStrategy: 'join',
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        avatar: true,
        phone: true,
        metadata: true,
        role: true,
        status: true,
        typeAuth: true,
        googleId: true,
        createdAt: true,
        updatedAt: true,
        password: false,
        timelineEvents: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 50,
          select: {
            id: true,
            eventType: true,
            title: true,
            metadata: true,
            createdAt: true,
          },
        },
      },
    });
  }

  private async queryPublicProfile(id: string) {
    return this.prisma.user.findUnique({
      relationLoadStrategy: 'join',
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        avatar: true,
        role: true,
        status: true,
        createdAt: true,
        timelineEvents: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 50,
          select: {
            id: true,
            eventType: true,
            title: true,
            metadata: true,
            createdAt: true,
          },
        },
      },
    });
  }

  async createUser(createUserDto: CreateUserDto): Promise<UserWithoutPassword> {
    const { email, password, fullName, avatar, phone, metadata } = createUserDto;

    // Kiểm tra email đã tồn tại chưa
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('Email đã được sử dụng');
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Tạo user mới với status ACTIVE (admin tạo thì active ngay)
    const newUser = await this.prisma.createUserWithUniqueId((id) =>
      this.prisma.user.create({
        data: {
          id,
          email,
          password: hashedPassword,
          fullName,
          avatar,
          phone,
          metadata: metadata ? (metadata as any) : {},
          status: 'ACTIVE',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          avatar: true,
          phone: true,
          metadata: true,
          role: true,
          status: true,
          googleId: true,
          typeAuth: true,
          createdAt: true,
          updatedAt: true,
          password: false,
        },
      }),
    );

    this.invalidateListCaches();
    return newUser;
  }

  async rejectUser(id: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User với ID ${id} không tồn tại`);
    }
    if (user.status !== 'PENDING') {
      throw new ConflictException('Chỉ có thể từ chối tài khoản đang chờ duyệt');
    }

    await this.prisma.user.delete({ where: { id } });
    this.sessionCache.invalidateUser(id);
    this.sessionCache.setStatusOverride(id, 'BLOCKED');
    this.invalidateListCaches();

    void this.emailService.sendRejectionEmail(user.email, user.fullName || undefined).catch((error) => {
      this.logger.error('Failed to send rejection email in background', error instanceof Error ? error.stack : undefined);
    });
  }

  async approveUser(id: string): Promise<UserWithoutPassword> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User với ID ${id} không tồn tại`);
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: { status: 'ACTIVE', updatedAt: new Date() },
      select: {
        id: true,
        email: true,
        fullName: true,
        avatar: true,
        phone: true,
        metadata: true,
        role: true,
        status: true,
        googleId: true,
        typeAuth: true,
        createdAt: true,
        updatedAt: true,
        password: false,
      },
    });

    this.sessionCache.invalidateUser(id);
    this.sessionCache.setStatusOverride(id, 'ACTIVE');
    this.invalidateListCaches();

    void this.emailService.sendApprovalEmail(user.email, user.fullName || undefined).catch((error) => {
      // Không rollback nếu gửi email lỗi — tài khoản vẫn được duyệt
      this.logger.error('Failed to send approval email in background', error instanceof Error ? error.stack : undefined);
    });

    return updatedUser;
  }

  async blockUser(id: string): Promise<UserWithoutPassword> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User với ID ${id} không tồn tại`);
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: { status: 'BLOCKED', updatedAt: new Date() },
      select: {
        id: true,
        email: true,
        fullName: true,
        avatar: true,
        phone: true,
        metadata: true,
        role: true,
        status: true,
        googleId: true,
        typeAuth: true,
        createdAt: true,
        updatedAt: true,
        password: false,
      },
    });

    this.sessionCache.invalidateUser(id);
    this.sessionCache.setStatusOverride(id, 'BLOCKED');
    this.invalidateListCaches();
    return updatedUser;
  }

  async unblockUser(id: string): Promise<UserWithoutPassword> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User với ID ${id} không tồn tại`);
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: { status: 'ACTIVE', updatedAt: new Date() },
      select: {
        id: true,
        email: true,
        fullName: true,
        avatar: true,
        phone: true,
        metadata: true,
        role: true,
        status: true,
        googleId: true,
        typeAuth: true,
        createdAt: true,
        updatedAt: true,
        password: false,
      },
    });

    this.sessionCache.invalidateUser(id);
    this.sessionCache.setStatusOverride(id, 'ACTIVE');
    this.invalidateListCaches();
    return updatedUser;
  }

  // Method để tìm user với password (dùng cho authentication)
  async findByEmailWithPassword(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async deleteUser(id: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User với ID ${id} không tồn tại`);
    }

    await this.prisma.user.delete({
      where: { id },
    });
    this.sessionCache.invalidateUser(id);
    this.invalidateListCaches();
  }

  async updateUser(
    id: string,
    updateUserDto: UpdateUserDto,
  ): Promise<UserWithoutPassword> {
    // Kiểm tra user có tồn tại không
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User với ID ${id} không tồn tại`);
    }

    // Chỉ update các trường được phép: fullName, avatar, phone, metadata
    // metadata được merge với data cũ thay vì replace toàn bộ
    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: updateUserDto.fullName,
        avatar: updateUserDto.avatar,
        phone: updateUserDto.phone,
        ...(updateUserDto.metadata !== undefined && {
          metadata: {
            ...(typeof user.metadata === 'object' && user.metadata !== null ? user.metadata : {}),
            ...updateUserDto.metadata,
          },
        }),
        updatedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        avatar: true,
        phone: true,
        metadata: true,
        role: true,
        status: true,
        googleId: true,
        typeAuth: true,
        createdAt: true,
        updatedAt: true,
        password: false,
      },
    });

    this.sessionCache.invalidateUser(id);
    this.invalidateListCaches();
    return updatedUser;
  }

  async searchUsers(query: string): Promise<{ id: string; fullName: string | null; avatar: string | null; metadata: any }[]> {
    const normalizedQuery = query?.trim();
    if (!normalizedQuery) return [];

    const cached = this.listCache.getSearch(normalizedQuery);
    if (cached) {
      return cached as { id: string; fullName: string | null; avatar: string | null; metadata: any }[];
    }

    const results = await this.prisma.user.findMany({
      where: {
        OR: [
          { fullName: { contains: normalizedQuery, mode: 'insensitive' } },
          { email: { contains: normalizedQuery, mode: 'insensitive' } },
        ],
      },
      select: { id: true, fullName: true, avatar: true, metadata: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    this.listCache.setSearch(normalizedQuery, results);
    return results;
  }
}
