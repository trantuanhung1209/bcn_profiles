import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Decorator để lấy thông tin author (user) từ request
 * Tương tự @User() nhưng semantic hơn khi nói về người tạo/sở hữu tài nguyên
 */
export const Author = createParamDecorator(
  (data: string, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    // Nếu có truyền key cụ thể, trả về property đó
    return data ? user?.[data] : user;
  },
);
