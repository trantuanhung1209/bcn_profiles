import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import type { SortableUserFields, SortOrder } from './users.service';
import { QueryUsersDto } from './dto/query-users.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { User } from '../auth/decorators/user.decorator';
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('search')
  async searchUsers(@Query('q') q: string) {
    const results = await this.usersService.searchUsers(q);
    return { users: results };
  }

  @Get()
  @Roles(Role.ADMIN)
  async findAll(@Query() query: QueryUsersDto) {
    const { page, limit, sort, order, search } = query;
    const result = await this.usersService.findAll(
      page,
      limit,
      sort as SortableUserFields,
      order as SortOrder,
      search,
    );
    return {
      ...result,
    };
  }

  @Get('count')
  @Roles(Role.ADMIN)
  async countUsers() {
    const count = await this.usersService.countUsers();
    return {
      count,
    };
  }

  @Get('email')
  @Roles(Role.ADMIN)
  async findByEmail(@Query('email') email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      return {
        message: 'User không tồn tại',
      };
    }
    return {
      users: user,
    };
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  async findOne(@Param('id') id: string) {
    const user = await this.usersService.findOne(id);
    return {
      users: user,
    };
  }

  @Post()
  @Roles(Role.ADMIN)
  async createUser(@Body() userData: CreateUserDto) {
    const newUser = await this.usersService.createUser(userData);
    return {
      users: newUser,
    };
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  async deleteUser(@Param('id') id: string) {
    await this.usersService.deleteUser(id);
    return {
      message: 'User đã được xóa',
    };
  }

  @Patch('me')
  @Roles(Role.USER)
  async updateUser(
    @Body() updateData: UpdateUserDto,
    @User() currentUser: any,
  ) {
    const updatedUser = await this.usersService.updateUser(currentUser.id, updateData);
    return {
      users: updatedUser,
    };
  }

  // Ví dụ: Route cho user xem thông tin của chính họ
  @Get('me/profile')
  async getMyProfile(@User() user: any) {
    return {
      user: user,
    };
  }
}
