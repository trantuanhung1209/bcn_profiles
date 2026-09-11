import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UsersService } from './users.service';
import type { SortableUserFields, SortOrder } from './users.service';
import { QueryUsersDto } from './dto/query-users.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateAvatarUploadSignatureDto } from './dto/create-avatar-upload-signature.dto';
import { SetAvatarDto } from './dto/set-avatar.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { User } from '../auth/decorators/user.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('search')
  @Roles(Role.ADMIN)
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

  @Get('pending')
  @Roles(Role.ADMIN)
  async findPendingUsers(@Query() query: QueryUsersDto) {
    const { page, limit, sort, order, search } = query;
    return this.usersService.findPending(
      page,
      limit,
      sort as SortableUserFields,
      order as SortOrder,
      search,
    );
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

  // Must be registered before parameterized ":id" routes.
  @Get('me/profile')
  async getMyProfile(@User() user: any) {
    return {
      user: user,
    };
  }

  @Patch('me')
  @Roles(Role.USER, Role.ADMIN)
  async updateUser(
    @Body() updateData: UpdateUserDto,
    @User() currentUser: any,
  ) {
    const updatedUser = await this.usersService.updateUser(
      currentUser.id,
      updateData,
    );
    return {
      users: updatedUser,
    };
  }

  @Post('me/avatar/upload-signature')
  @Roles(Role.USER, Role.ADMIN)
  async createAvatarUploadSignature(
    @Body() dto: CreateAvatarUploadSignatureDto,
    @User() currentUser: any,
  ) {
    return this.usersService.createAvatarUploadSignature(currentUser.id, dto);
  }

  @Patch('me/avatar')
  @Roles(Role.USER, Role.ADMIN)
  async setAvatar(@Body() dto: SetAvatarDto, @User() currentUser: any) {
    const user = await this.usersService.setAvatar(currentUser.id, dto);
    return { users: user };
  }

  @Delete('me/avatar')
  @Roles(Role.USER, Role.ADMIN)
  async clearAvatar(@User() currentUser: any) {
    const user = await this.usersService.clearAvatar(currentUser.id);
    return { users: user };
  }

  @Get(':id/profile')
  async getUserPublicProfile(@Param('id') id: string) {
    const user = await this.usersService.getPublicProfile(id);
    return {
      user: user,
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

  @Patch(':id/approve')
  @Roles(Role.ADMIN)
  async approveUser(@Param('id') id: string) {
    const user = await this.usersService.approveUser(id);
    return { message: 'Tài khoản đã được phê duyệt', user };
  }

  @Patch(':id/block')
  @Roles(Role.ADMIN)
  async blockUser(@Param('id') id: string, @User() currentUser: any) {
    if (currentUser.id === id) {
      throw new ForbiddenException(
        'Bạn không thể tự khóa tài khoản của chính mình',
      );
    }
    const user = await this.usersService.blockUser(id);
    return { message: 'Tài khoản đã bị khóa', user };
  }

  @Patch(':id/unblock')
  @Roles(Role.ADMIN)
  async unblockUser(@Param('id') id: string) {
    const user = await this.usersService.unblockUser(id);
    return { message: 'Tài khoản đã được mở khóa', user };
  }

  @Delete(':id/reject')
  @Roles(Role.ADMIN)
  async rejectUser(@Param('id') id: string) {
    await this.usersService.rejectUser(id);
    return { message: 'Yêu cầu đăng ký đã bị từ chối và xóa khỏi hệ thống' };
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  async deleteUser(@Param('id') id: string, @User() currentUser: any) {
    if (currentUser.id === id) {
      throw new ForbiddenException(
        'Bạn không thể tự xóa tài khoản của chính mình',
      );
    }
    await this.usersService.deleteUser(id);
    return {
      message: 'User đã được xóa',
    };
  }
}
