
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl } = req;
    const now = Date.now();
    res.on('finish', () => {
      const responseTime = Date.now() - now;
      console.log(`[${method}] ${originalUrl} - ${res.statusCode} - ${responseTime} ms`);
    });
    next();
  }
}
