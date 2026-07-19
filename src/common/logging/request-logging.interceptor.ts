import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import type { Logger } from 'winston';

type RequestUser = {
  id?: unknown;
  userId?: unknown;
  sub?: unknown;
  data?: {
    id?: unknown;
    user?: {
      id?: unknown;
      userId?: unknown;
      sub?: unknown;
    };
  };
};

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER)
    private readonly logger: Logger,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request & { user?: RequestUser }>();
    const response = http.getResponse<Response>();
    const startedAt = Date.now();
    const method = request.method;
    const url = request.originalUrl ?? request.url;
    let logged = false;

    const logOnce = (error?: unknown) => {
      if (logged) {
        return;
      }
      logged = true;

      const status = error
        ? this.extractStatusCode(error, response.statusCode)
        : response.statusCode;
      this.logRequest(request, method, url, status, Date.now() - startedAt, error);
    };

    // Log when the response has actually been sent to the client.
    response.once('finish', () => logOnce());
    response.once('close', () => {
      if (!response.writableEnded) {
        logOnce();
      }
    });

    return next.handle().pipe(
      catchError((error: unknown) => {
        // Exception filters still write a response; 'finish'/'close' log duration.
        return throwError(() => error);
      }),
    );
  }

  private logRequest(
    request: Request & { user?: RequestUser },
    method: string,
    url: string,
    status: number,
    durationMs: number,
    error?: unknown,
  ): void {
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
    const message =
      error instanceof Error
        ? `${method} ${url} ${status} ${durationMs}ms - ${error.message}`
        : `${method} ${url} ${status} ${durationMs}ms`;

    this.logger.log(level, message, {
      user_id: this.extractUserId(request.user),
      action: `${method} ${url}`,
      method,
      url,
      status,
      statusCode: status,
      ip: this.extractClientIp(request),
      duration_ms: durationMs,
      response_time_ms: durationMs,
    });
  }

  private extractClientIp(request: Request): string | undefined {
    const forwardedFor = request.headers['x-forwarded-for'];

    if (typeof forwardedFor === 'string' && forwardedFor.trim().length > 0) {
      return forwardedFor.split(',')[0].trim();
    }

    if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
      return forwardedFor[0];
    }

    return request.ip || request.socket.remoteAddress;
  }

  private extractUserId(user?: RequestUser): string | undefined {
    const candidates = [
      user?.id,
      user?.userId,
      user?.sub,
      user?.data?.id,
      user?.data?.user?.id,
      user?.data?.user?.userId,
      user?.data?.user?.sub,
    ];

    const userId = candidates.find(
      (value): value is string | number =>
        (typeof value === 'string' && value.trim().length > 0) ||
        typeof value === 'number',
    );

    return userId === undefined ? undefined : String(userId);
  }

  private extractStatusCode(error: unknown, fallbackStatus: number): number {
    if (
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      typeof error.status === 'number'
    ) {
      return error.status;
    }

    if (
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
    ) {
      return error.statusCode;
    }

    return fallbackStatus >= 400 ? fallbackStatus : 500;
  }
}
