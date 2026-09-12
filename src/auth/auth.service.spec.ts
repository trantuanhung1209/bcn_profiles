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
        {
          provide: PrismaService,
          useValue: { user: { findUnique: jest.fn() } },
        },
        {
          provide: JwtService,
          useValue: { sign: jest.fn(), verify: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test-secret') },
        },
        { provide: EmailService, useValue: {} },
        { provide: TwoFactorAuthService, useValue: {} },
        {
          provide: AuthSessionCacheService,
          useValue: { setUser: jest.fn(), getRevokedBefore: jest.fn() },
        },
        {
          provide: TokenRevocationService,
          useValue: {
            isRevoked: jest.fn().mockResolvedValue(false),
            revoke: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    const user = {
      id: 'u1',
      email: 'test@example.invalid',
      role: 'USER',
      status: 'ACTIVE',
      fullName: null,
      avatar: null,
    };
    const jwt = module.get<JwtService>(JwtService);
    const prisma = module.get<PrismaService>(PrismaService);
    const cache = module.get<AuthSessionCacheService>(AuthSessionCacheService);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(user);
    (jwt.sign as jest.Mock).mockImplementation((payload) =>
      JSON.stringify(payload),
    );
    (jwt.verify as jest.Mock).mockReturnValue({
      sub: 'u1',
      type: 'refresh',
      jti: 'r1',
      iat: 1800000000,
      issuedAtMs: 1800000000600,
    });
    (cache.getRevokedBefore as jest.Mock).mockResolvedValue(1800000000500);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('refreshes immediately after revocation within the same JWT second', async () => {
    const result = await service.refreshTokens('test-refresh');
    expect(result.access_token).toBeDefined();
    expect(JSON.parse(result.access_token).issuedAtMs).toEqual(
      expect.any(Number),
    );
    expect(JSON.parse(result.refresh_token).issuedAtMs).toBe(
      JSON.parse(result.access_token).issuedAtMs,
    );
  });
});
