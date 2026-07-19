import { UnauthorizedException } from '@nestjs/common';

/** Extract raw token from `Authorization: Bearer <token>`. */
export function extractBearerToken(authHeader?: string): string {
  if (!authHeader) {
    throw new UnauthorizedException('Authorization header is required');
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    throw new UnauthorizedException('Invalid authorization header format');
  }

  return token;
}
