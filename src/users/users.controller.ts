import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import type { SortableUserFields, SortOrder } from './users.service';
import { QueryUsersDto } from './dto/query-users.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
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
  async countUsers() {
    const count = await this.usersService.countUsers();
    return {
      count,
    };
  }

  @Get('email')
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
  async findOne(@Param('id') id: string) {
    const user = await this.usersService.findOne(id);
    return {
      users: user,
    };
  }

  @Post()
  async createUser(@Body() userData: CreateUserDto) {
    const newUser = await this.usersService.createUser(userData);
    return {
      users: newUser,
    };
  }

  @Delete(':id')
  async deleteUser(@Param('id') id: string) {
    await this.usersService.deleteUser(id);
    return {
      message: 'User đã được xóa',
    };
  }

  @Patch(':id')
  async updateUser(@Param('id') id: string, @Body() updateData: UpdateUserDto) {
    const updatedUser = await this.usersService.updateUser(id, updateData);
    return {
      users: updatedUser,
    };
  }
}
