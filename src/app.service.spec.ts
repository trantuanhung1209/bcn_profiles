import { ServiceUnavailableException } from '@nestjs/common';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

describe('AppService health check', () => {
  it('reports UP when the database responds', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    } as unknown as PrismaService;
    const service = new AppService(prisma);

    await expect(service.checkDatabaseConnection()).resolves.toMatchObject({
      status: 'UP',
      database: 'connected',
    });
  });

  it('returns a 503 exception when the database is unavailable', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('connection refused')),
    } as unknown as PrismaService;
    const service = new AppService(prisma);

    await expect(service.checkDatabaseConnection()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
