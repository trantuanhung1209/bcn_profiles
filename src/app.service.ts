import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly prisma: PrismaService) {}

  getHello(): string {
    this.logger.log('getHello() called');
    return 'Hello Chat App With NestJS!';
  }

  async checkDatabaseConnection() {
    try {
      // Thử thực hiện một query đơn giản để kiểm tra kết nối
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'success',
        message: 'Đã kết nối với Prisma và database thành công!',
        timestamp: new Date().toISOString(),
        database: 'connected'
      };
    } catch (error) {
      this.logger.error('Database connection failed:', error);
      return {
        status: 'error',
        message: 'Không thể kết nối với database',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
