import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TwoFactorSetupGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Setup token is missing');
    }

    const token = authHeader.split(' ')[1];

    try {
      const secret = this.configService.get<string>('JWT_SECRET') || 'your-secret-key';
      const payload = this.jwtService.verify(token, {
        secret,
      });

      if (payload.type !== 'setup-2fa') {
        throw new UnauthorizedException('Invalid token type');
      }

      // Attach user info to request (including TOTP secret if present)
      request.user = {
        userId: payload.sub,
        email: payload.email,
        totpSecret: payload.totpSecret,
      };

      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired setup token');
    }
  }
}
