import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from './services/email.service';
import { TwoFactorAuthService } from './services/two-factor-auth.service';
import { AuthSessionCacheService } from './services/auth-session-cache.service';
import { TokenRevocationService } from './services/token-revocation.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: {} },
        { provide: JwtService, useValue: { sign: jest.fn(), verify: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: EmailService, useValue: {} },
        { provide: TwoFactorAuthService, useValue: {} },
        { provide: AuthSessionCacheService, useValue: {} },
        { provide: TokenRevocationService, useValue: {} },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
