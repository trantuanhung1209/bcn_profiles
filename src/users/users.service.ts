import {
  BadRequestException,
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
import { CreateAvatarUploadSignatureDto } from './dto/create-avatar-upload-signature.dto';
import { SetAvatarDto } from './dto/set-avatar.dto';
import { EmailService } from '../auth/services/email.service';
import { AuthSessionCacheService } from '../auth/services/auth-session-cache.service';
import { UsersListCacheService } from './users-list-cache.service';
import { CloudinaryService } from '../common/storage/cloudinary.service';

export type UserWithoutPassword = Omit<
  User,
  | 'password'
  | 'twoFactorEnabled'
  | 'twoFactorRequired'
  | 'totpSecret'
  | 'twoFactorRecoveryCodes'
  | 'avatarPublicId'
>;

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
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.prefetchHotUserLists();
  }

  /** Keep common admin read endpoints warm so the first browser hit is a cache hit. */
  @Cron(CronExpression.EVERY_5_MINUTES)
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
        {
          scope: 'pending',
          page: 1,
          limit: 10,
          sort: 'createdAt',
          order: 'desc',
        },
        {
          scope: 'pending',
          page: 1,
          limit: 10,
          sort: 'createdAt',
          order: 'asc',
        },
        {
          scope: 'pending',
          page: 1,
          limit: 10,
          sort: 'fullName',
          order: 'asc',
        },
      ];

      const pages = await Promise.all(
        hotQueries.map(async (query) => {
          const result =
            query.scope === 'pending'
              ? await this.queryPendingPage(
                  query.page,
                  query.limit,
                  query.sort,
                  query.order,
                )
              : await this.queryAllPage(
                  query.page,
                  query.limit,
                  query.sort,
                  query.order,
                );
          await this.listCache.setPage(
            this.listCache.buildPageKey({ ...query }),
            result,
          );
          return { query, result };
        }),
      );

      const count = await this.queryCount();
      await this.listCache.setCount(count);

      // Warm details/profiles for likely first-click rows + admins (often opened immediately).
      const userIds = new Set<string>();
      for (const { query, result } of pages) {
        const isPrimary =
          (query.scope === 'all' &&
            query.sort === 'fullName' &&
            query.order === 'asc' &&
            query.page === 1) ||
          (query.scope === 'pending' &&
            query.sort === 'createdAt' &&
            query.order === 'desc' &&
            query.page === 1);
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
          await this.listCache.setDetail(id, detail);
          await this.listCache.setByEmail(detail.email, detail);
        }
        if (profile) {
          await this.listCache.setProfile(id, profile);
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
    const cached = await this.listCache.getPage(cacheKey);
    if (cached) {
      return cached as PaginatedUsers;
    }

    const result = await this.queryPendingPage(
      page,
      limit,
      sort,
      order,
      search,
    );
    await this.listCache.setPage(cacheKey, result);
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
    const cached = await this.listCache.getPage(cacheKey);
    if (cached) {
      return cached as PaginatedUsers;
    }

    const result = await this.queryAllPage(page, limit, sort, order, search);
    await this.listCache.setPage(cacheKey, result);
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
              {
                fullName: {
                  contains: normalizedSearch,
                  mode: 'insensitive' as const,
                },
              },
              {
                email: {
                  contains: normalizedSearch,
                  mode: 'insensitive' as const,
                },
              },
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
            {
              fullName: {
                contains: normalizedSearch,
                mode: 'insensitive' as const,
              },
            },
            {
              email: {
                contains: normalizedSearch,
                mode: 'insensitive' as const,
              },
            },
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

  private async invalidateListCaches(): Promise<void> {
    await this.listCache.invalidateAll();
  }

  async findOne(id: string): Promise<UserWithoutPassword> {
    const cached = await this.listCache.getDetail(id);
    if (cached) {
      return cached as UserWithoutPassword;
    }

    const user = await this.queryFindOne(id);
    if (!user) {
      throw new NotFoundException(`User với ID ${id} không tồn tại`);
    }

    await this.listCache.setDetail(id, user);
    await this.listCache.setByEmail(user.email, user);
    return user;
  }

  async getPublicProfile(id: string) {
    const cached = await this.listCache.getProfile(id);
    if (cached) {
      return cached;
    }

    const user = await this.queryPublicProfile(id);
    if (!user) {
      throw new NotFoundException(`User với ID ${id} không tồn tại`);
    }

    await this.listCache.setProfile(id, user);
    return user;
  }

  async findByEmail(email: string): Promise<UserWithoutPassword | null> {
    const cached = await this.listCache.getByEmail(email);
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

    await this.listCache.setByEmail(email, user);
    if (user) {
      // Detail cache may be richer later; email lookup still benefits immediately.
      await this.listCache.setDetail(user.id, user);
    }
    return user;
  }

  async countUsers(): Promise<number> {
    const cached = await this.listCache.getCount();
    if (cached !== undefined) {
      return cached;
    }

    const count = await this.queryCount();
    await this.listCache.setCount(count);
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
    const { email, password, fullName, avatar, phone, metadata } =
      createUserDto;

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

    await this.invalidateListCaches();
    return newUser;
  }

  async rejectUser(id: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User với ID ${id} không tồn tại`);
    }
    if (user.status !== 'PENDING') {
      throw new ConflictException(
        'Chỉ có thể từ chối tài khoản đang chờ duyệt',
      );
    }

    await this.prisma.user.delete({ where: { id } });
    await this.sessionCache.invalidateUser(id);
    await this.invalidateListCaches();

    void this.emailService
      .sendRejectionEmail(user.email, user.fullName || undefined)
      .catch((error) => {
        this.logger.error(
          'Failed to send rejection email in background',
          error instanceof Error ? error.stack : undefined,
        );
      });
  }

  async approveUser(id: string): Promise<UserWithoutPassword> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User với ID ${id} không tồn tại`);
    }
    if (user.status !== 'PENDING') {
      throw new ConflictException('Chỉ có thể duyệt tài khoản đang chờ duyệt');
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

    await this.sessionCache.invalidateUser(id);
    await this.invalidateListCaches();

    void this.emailService
      .sendApprovalEmail(user.email, user.fullName || undefined)
      .catch((error) => {
        // Không rollback nếu gửi email lỗi — tài khoản vẫn được duyệt
        this.logger.error(
          'Failed to send approval email in background',
          error instanceof Error ? error.stack : undefined,
        );
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

    await this.sessionCache.invalidateUser(id);
    await this.sessionCache.setRevokedBefore(id);
    await this.invalidateListCaches();
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

    await this.sessionCache.invalidateUser(id);
    await this.invalidateListCaches();
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

    const avatarPublicId = user.avatarPublicId;
    await this.prisma.user.delete({
      where: { id },
    });
    if (avatarPublicId) {
      await this.cloudinaryService.deleteImage(avatarPublicId);
    }
    await this.sessionCache.invalidateUser(id);
    await this.invalidateListCaches();
  }

  async updateUser(
    id: string,
    updateUserDto: UpdateUserDto,
  ): Promise<UserWithoutPassword> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User với ID ${id} không tồn tại`);
    }

    const hasAvatar = updateUserDto.avatar !== undefined;
    const hasAvatarPublicId = updateUserDto.avatarPublicId !== undefined;
    const clearingAvatar =
      updateUserDto.avatar === null &&
      (!hasAvatarPublicId || updateUserDto.avatarPublicId === null);
    const settingAvatar =
      typeof updateUserDto.avatar === 'string' &&
      typeof updateUserDto.avatarPublicId === 'string' &&
      updateUserDto.avatarPublicId.length > 0;
    const legacyAvatarUpdate =
      typeof updateUserDto.avatar === 'string' && !hasAvatarPublicId;

    if (
      (hasAvatarPublicId && !hasAvatar) ||
      (hasAvatarPublicId &&
        updateUserDto.avatarPublicId === null &&
        updateUserDto.avatar !== null) ||
      (updateUserDto.avatar === null &&
        hasAvatarPublicId &&
        updateUserDto.avatarPublicId !== null)
    ) {
      throw new BadRequestException(
        'avatar và avatarPublicId phải cùng có giá trị hoặc cùng là null',
      );
    }

    if (settingAvatar) {
      await this.validateCloudinaryAvatar(
        id,
        updateUserDto.avatar!,
        updateUserDto.avatarPublicId!,
      );
    }

    const previousPublicId = user.avatarPublicId;

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: {
        ...(updateUserDto.fullName !== undefined && {
          fullName: updateUserDto.fullName,
        }),
        ...(updateUserDto.phone !== undefined && {
          phone: updateUserDto.phone,
        }),
        ...(clearingAvatar && { avatar: null, avatarPublicId: null }),
        ...(settingAvatar && {
          avatar: updateUserDto.avatar,
          avatarPublicId: updateUserDto.avatarPublicId,
        }),
        ...(legacyAvatarUpdate && {
          avatar: updateUserDto.avatar,
          avatarPublicId: null,
        }),
        ...(updateUserDto.metadata !== undefined && {
          metadata: {
            ...(typeof user.metadata === 'object' && user.metadata !== null
              ? user.metadata
              : {}),
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

    if (
      previousPublicId &&
      (clearingAvatar ||
        legacyAvatarUpdate ||
        (settingAvatar && previousPublicId !== updateUserDto.avatarPublicId))
    ) {
      await this.cloudinaryService.deleteImage(previousPublicId);
    }

    await this.sessionCache.invalidateUser(id);
    await this.invalidateListCaches();
    return updatedUser as UserWithoutPassword;
  }

  createAvatarUploadSignature(
    userId: string,
    dto: CreateAvatarUploadSignatureDto,
  ) {
    const folder = this.getAvatarFolder(userId);
    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = dto.publicId?.trim()
      ? this.sanitizePublicId(dto.publicId)
      : undefined;

    return this.cloudinaryService.createUploadSignature({
      timestamp,
      folder,
      publicId,
      includeMaxBytes: true,
      ...this.cloudinaryService.getImageOptimizationDefaults(),
    });
  }

  async setAvatar(
    userId: string,
    dto: SetAvatarDto,
  ): Promise<UserWithoutPassword> {
    return this.updateUser(userId, {
      avatar: dto.avatar,
      avatarPublicId: dto.avatarPublicId,
    });
  }

  async clearAvatar(userId: string): Promise<UserWithoutPassword> {
    return this.updateUser(userId, {
      avatar: null,
      avatarPublicId: null,
    });
  }

  private async validateCloudinaryAvatar(
    userId: string,
    avatarUrl: string,
    avatarPublicId: string,
  ): Promise<void> {
    const { cloudName } = this.cloudinaryService.getCloudinaryConfig();
    let parsed: URL;
    try {
      parsed = new URL(avatarUrl);
    } catch {
      throw new BadRequestException('avatar is not a valid URL');
    }

    if (
      parsed.protocol !== 'https:' ||
      parsed.hostname !== 'res.cloudinary.com'
    ) {
      throw new BadRequestException(
        'avatar must be a valid Cloudinary https URL',
      );
    }

    const expectedFolder = this.getAvatarFolder(userId);
    if (!avatarPublicId.startsWith(`${expectedFolder}/`)) {
      throw new BadRequestException(
        'avatar does not belong to the current user',
      );
    }

    let decodedPath: string;
    try {
      decodedPath = decodeURIComponent(parsed.pathname);
    } catch {
      throw new BadRequestException('avatar contains an invalid URL path');
    }

    if (!decodedPath.startsWith(`/${cloudName}/image/upload/`)) {
      throw new BadRequestException(
        'avatar does not belong to the configured Cloudinary cloud',
      );
    }

    const escapedPublicId = avatarPublicId.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    );
    if (!new RegExp(`/${escapedPublicId}\\.[a-zA-Z0-9]+$`).test(decodedPath)) {
      throw new BadRequestException('avatar URL does not match avatarPublicId');
    }

    await this.cloudinaryService.assertImageWithinMaxBytes(avatarPublicId);
  }

  private getAvatarFolder(userId: string): string {
    const baseFolder =
      (process.env.CLOUDINARY_AVATAR_FOLDER ?? '')
        .trim()
        .replace(/^\/+|\/+$/g, '') || 'user-avatars';
    return `${baseFolder}/${userId}`;
  }

  private sanitizePublicId(input: string): string {
    const trimmed = input.trim();
    const sanitized = trimmed
      .replace(/[^a-zA-Z0-9/_-]/g, '_')
      .replace(/^\/+|\/+$/g, '');

    if (!sanitized) {
      throw new BadRequestException('publicId is invalid');
    }

    return sanitized;
  }

  async searchUsers(
    query: string,
  ): Promise<{ id: string; fullName: string | null; avatar: string | null }[]> {
    const normalizedQuery = query?.trim();
    if (!normalizedQuery) return [];

    const cached = await this.listCache.getSearch(normalizedQuery);
    if (cached) {
      return cached as {
        id: string;
        fullName: string | null;
        avatar: string | null;
      }[];
    }

    const results = await this.prisma.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        fullName: { contains: normalizedQuery, mode: 'insensitive' },
      },
      select: { id: true, fullName: true, avatar: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    await this.listCache.setSearch(normalizedQuery, results);
    return results;
  }
}
