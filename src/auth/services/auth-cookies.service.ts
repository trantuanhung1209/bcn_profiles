import { Injectable } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';

@Injectable()
export class AuthCookiesService {
  private readonly isProduction = process.env.NODE_ENV === 'production';

  /**
   * Cookie Domain must be a suffix of the API host so both
   * *.uside.studio and *.uside.id.vn work.
   */
  resolveCookieDomain(req: Request): string | undefined {
    const forwarded = String(req.headers['x-forwarded-host'] ?? '')
      .split(',')[0]
      .trim()
      .toLowerCase();
    const host = (forwarded || String(req.headers.host ?? ''))
      .toLowerCase()
      .split(':')[0];

    if (host === 'uside.id.vn' || host.endsWith('.uside.id.vn')) {
      return '.uside.id.vn';
    }
    if (host === 'uside.studio' || host.endsWith('.uside.studio')) {
      return '.uside.studio';
    }

    return undefined;
  }

  baseOptions(req: Request): CookieOptions {
    if (this.isProduction) {
      const domain = this.resolveCookieDomain(req);
      return {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        ...(domain ? { domain } : {}),
        path: '/',
      };
    }

    // Dev: sameSite=none + secure=false for cross-port localhost FE/BE.
    return {
      httpOnly: true,
      secure: false,
      sameSite: 'none',
      path: '/',
    };
  }

  accessOptions(req: Request): CookieOptions {
    return {
      ...this.baseOptions(req),
      maxAge: 60 * 60 * 1000,
    };
  }

  refreshOptions(req: Request): CookieOptions {
    return {
      ...this.baseOptions(req),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    };
  }

  setAuthCookies(
    response: Response,
    tokens: { access_token: string; refresh_token: string },
  ): void {
    const req = response.req;
    response.cookie('access_token', tokens.access_token, this.accessOptions(req));
    response.cookie('refresh_token', tokens.refresh_token, this.refreshOptions(req));
  }

  clearAuthCookies(response: Response): void {
    const options = this.baseOptions(response.req);
    response.clearCookie('access_token', options);
    response.clearCookie('refresh_token', options);
  }
}
