import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { encryptSecret, decryptSecret } from '../utils/secret-crypto';

export type ChallengeType = 'setup-2fa' | 'verify-2fa' | 'recovery-2fa';

export type ChallengePayload = {
  jti: string;
  userId: string;
  email: string;
  type: ChallengeType;
  totpSecret?: string;
};

@Injectable()
export class AuthChallengeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private jwtSecret(): string {
    const secret = this.configService.get<string>('JWT_SECRET')?.trim();
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is required');
    }
    return secret;
  }

  async issue(
    type: ChallengeType,
    userId: string,
    email: string,
    expiresInSeconds: number,
    totpSecret?: string,
  ): Promise<string> {
    const jti = randomUUID();
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    await this.prisma.authChallenge.create({
      data: {
        id: jti,
        userId,
        email,
        type,
        totpSecretEnc: totpSecret ? encryptSecret(totpSecret) : null,
        expiresAt,
      },
    });

    return this.jwtService.sign(
      { sub: userId, email, type, jti },
      { secret: this.jwtSecret(), expiresIn: expiresInSeconds },
    );
  }

  /**
   * Validate challenge JWT + DB row. Does not consume.
   */
  async validate(
    token: string,
    expectedType: ChallengeType,
  ): Promise<ChallengePayload> {
    let payload: { sub?: string; email?: string; type?: string; jti?: string };
    try {
      payload = this.jwtService.verify(token, { secret: this.jwtSecret() });
    } catch {
      throw new UnauthorizedException('Invalid or expired challenge token');
    }

    if (
      payload.type !== expectedType ||
      !payload.jti ||
      !payload.sub ||
      !payload.email
    ) {
      throw new UnauthorizedException('Invalid token type');
    }

    const row = await this.prisma.authChallenge.findUnique({
      where: { id: payload.jti },
    });

    if (!row || row.type !== expectedType || row.userId !== payload.sub) {
      throw new UnauthorizedException('Invalid or expired challenge token');
    }
    if (row.usedAt) {
      throw new UnauthorizedException('Challenge token đã được sử dụng');
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Challenge token đã hết hạn');
    }

    return {
      jti: row.id,
      userId: row.userId,
      email: row.email,
      type: expectedType,
      totpSecret: row.totpSecretEnc
        ? decryptSecret(row.totpSecretEnc)
        : undefined,
    };
  }

  /** Atomically mark challenge used. Returns false if already used/missing. */
  async consume(jti: string): Promise<boolean> {
    const result = await this.prisma.authChallenge.updateMany({
      where: { id: jti, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    return result.count === 1;
  }

  async validateAndConsume(
    token: string,
    expectedType: ChallengeType,
  ): Promise<ChallengePayload> {
    const challenge = await this.validate(token, expectedType);
    const ok = await this.consume(challenge.jti);
    if (!ok) {
      throw new UnauthorizedException('Challenge token đã được sử dụng');
    }
    return challenge;
  }
}
