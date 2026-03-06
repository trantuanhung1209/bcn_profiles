import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../enums/role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Lấy roles được định nghĩa trong decorator @Roles()
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    console.log('🔐 Required roles:', requiredRoles);

    // Nếu không có roles được yêu cầu, cho phép truy cập
    if (!requiredRoles) {
      return true;
    }

    // Lấy user từ request (đã được gắn bởi JwtAuthGuard)
    const { user } = context.switchToHttp().getRequest();

    console.log('👤 User from request:', user);
    console.log('🎭 User role:', user?.role);

    // Kiểm tra nếu không có user
    if (!user) {
      throw new ForbiddenException('Bạn cần đăng nhập để truy cập tài nguyên này');
    }

    // Kiểm tra xem role của user có trong danh sách roles được yêu cầu không
    const hasRole = requiredRoles.some((role) => user.role === role);

    console.log('✅ Has required role:', hasRole);

    if (!hasRole) {
      throw new ForbiddenException(`Bạn không có quyền truy cập tài nguyên này. Cần role: ${requiredRoles.join(', ')}, nhưng bạn có role: ${user.role}`);
    }

    return true;
  }
}
