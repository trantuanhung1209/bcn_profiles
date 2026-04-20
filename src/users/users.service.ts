import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, UserStatus } from 'prisma/client/client';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { EmailService } from '../auth/services/email.service';

export type UserWithoutPassword = Omit<User, 'password' | 'twoFactorEnabled' | 'totpSecret' | 'twoFactorRecoveryCodes'>;

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

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
  ) {}

  async findPending(
    page: number = 1,
    limit: number = 10,
    sort: SortableUserFields = 'createdAt',
    order: SortOrder = 'asc',
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

    const select = {
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
          createdAt: 'desc',
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

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select,
        orderBy: { [sort]: order },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    sort: SortableUserFields = 'createdAt',
    order: SortOrder = 'desc',
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

    // Nếu không có search, query bình thường
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
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
          timelineEvents: {
            orderBy: {
              createdAt: 'desc',
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
        },
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

  async findOne(id: string): Promise<UserWithoutPassword> {
    const user = await this.prisma.user.findUnique({
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

    if (!user) {
      throw new NotFoundException(`User với ID ${id} không tồn tại`);
    }

    return user;
  }

  async getPublicProfile(id: string) {
    const user = await this.prisma.user.findUnique({
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
          select: {
            id: true,
            eventType: true,
            title: true,
            metadata: true,
            createdAt: true,
          },
        },
        // Không trả về: phone, metadata, googleId, typeAuth, updatedAt
      },
    });

    if (!user) {
      throw new NotFoundException(`User với ID ${id} không tồn tại`);
    }

    return user;
  }

  async findByEmail(email: string): Promise<UserWithoutPassword | null> {
    return this.prisma.user.findUnique({
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
  }

  async countUsers(): Promise<number> {
    return this.prisma.user.count();
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

    void this.emailService.sendRejectionEmail(user.email, user.fullName || undefined).catch((error) => {
      console.error('Failed to send rejection email in background:', error);
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

    void this.emailService.sendApprovalEmail(user.email, user.fullName || undefined).catch((error) => {
      // Không rollback nếu gửi email lỗi — tài khoản vẫn được duyệt
      console.error('Failed to send approval email in background:', error);
    });

    return updatedUser;
  }

  async blockUser(id: string): Promise<UserWithoutPassword> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User với ID ${id} không tồn tại`);
    }

    return this.prisma.user.update({
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
  }

  async unblockUser(id: string): Promise<UserWithoutPassword> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User với ID ${id} không tồn tại`);
    }

    return this.prisma.user.update({
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

    // Chỉ update các trường được phép: fullName, avatar, metadata
    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: updateUserDto.fullName,
        avatar: updateUserDto.avatar,
        phone: updateUserDto.phone,
        ...(updateUserDto.metadata !== undefined && { metadata: updateUserDto.metadata as any }),
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

    return updatedUser;
  }

  async searchUsers(query: string): Promise<{ id: string; fullName: string | null; avatar: string | null; metadata: any }[]> {
    const normalizedQuery = query?.trim();
    if (!normalizedQuery) return [];

    return this.prisma.user.findMany({
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
  }
}
