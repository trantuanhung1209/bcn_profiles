import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User } from 'prisma/client/client';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { randomUUID } from 'crypto';
import { vietnameseIncludes } from '../common/utils/vietnamese.util';

export type UserWithoutPassword = Omit<User, 'password'>;

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
  constructor(private prisma: PrismaService) {}

  async findAll(
    page: number = 1,
    limit: number = 10,
    sort: SortableUserFields = 'createdAt',
    order: SortOrder = 'desc',
    search?: string,
  ): Promise<PaginatedUsers> {
    const skip = (page - 1) * limit;

    if (search) {
      // Với search tiếng Việt, lấy tất cả users và filter bằng code
      const allUsers = await this.prisma.user.findMany({
        select: {
          id: true,
          email: true,
          fullName: true,
          avatar: true,
          bio: true,
          isOnline: true,
          lastSeen: true,
          role: true,
          googleId: true,
          typeAuth: true,
          createdAt: true,
          updatedAt: true,
          password: false,
        },
        orderBy: {
          [sort]: order,
        },
      });

      // Filter users theo search term (hỗ trợ tiếng Việt có dấu và không dấu)
      const filteredUsers = allUsers.filter((user) => {
        const searchLower = search.toLowerCase();
        const fullName = user.fullName || '';
        const email = user.email || '';

        // Tìm kiếm thông thường (case-insensitive)
        const normalMatch =
          fullName.toLowerCase().includes(searchLower) ||
          email.toLowerCase().includes(searchLower);

        // Tìm kiếm bỏ dấu tiếng Việt
        const vietnameseMatch =
          vietnameseIncludes(fullName, search) ||
          vietnameseIncludes(email, search);

        return normalMatch || vietnameseMatch;
      });

      // Apply pagination sau khi filter
      const total = filteredUsers.length;
      const paginatedData = filteredUsers.slice(skip, skip + limit);

      return {
        data: paginatedData,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    }

    // Nếu không có search, query bình thường
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          fullName: true,
          avatar: true,
          bio: true,
          isOnline: true,
          lastSeen: true,
          role: true,
          googleId: true,
          typeAuth: true,
          createdAt: true,
          updatedAt: true,
          password: false,
        },
        orderBy: {
          [sort]: order,
        },
      }),
      this.prisma.user.count(),
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
        bio: true,
        isOnline: true,
        lastSeen: true,
        role: true,
        typeAuth: true,
        googleId: true,
        createdAt: true,
        updatedAt: true,
        password: false,
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
        bio: true,
        isOnline: true,
        lastSeen: true,
        role: true,
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
    const { email, password, fullName, avatar, bio } = createUserDto;

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

    // Tạo user mới
    const newUser = await this.prisma.user.create({
      data: {
        id: `BCN_${randomUUID()}`,
        email,
        password: hashedPassword,
        fullName,
        avatar,
        bio,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        avatar: true,
        bio: true,
        isOnline: true,
        lastSeen: true,
        role: true,
        googleId: true,
        typeAuth: true,
        createdAt: true,
        updatedAt: true,
        password: false,
      },
    });

    return newUser;
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

    // Chỉ update các trường được phép: fullName, avatar, bio
    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: {
        ...updateUserDto,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        avatar: true,
        bio: true,
        isOnline: true,
        lastSeen: true,
        role: true,
        googleId: true,
        typeAuth: true,
        createdAt: true,
        updatedAt: true,
        password: false,
      },
    });

    return updatedUser;
  }
}
