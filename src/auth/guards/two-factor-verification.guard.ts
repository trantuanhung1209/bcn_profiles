import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthChallengeService } from '../services/auth-challenge.service';

@Injectable()
export class TwoFactorVerificationGuard implements CanActivate {
  constructor(private readonly challengeService: AuthChallengeService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Verification token is missing');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new UnauthorizedException('Verification token is missing');
    }

    const challenge = await this.challengeService.validate(token, 'verify-2fa');
    request.user = {
      userId: challenge.userId,
      email: challenge.email,
      jti: challenge.jti,
    };
    request.challengeToken = token;
    return true;
  }
}
