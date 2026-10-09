import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError.js';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.status).json({
      type: `https://api.example.com/errors/${err.code.toLowerCase().replace(/_/g, '-')}`,
      title: err.title,
      status: err.status,
      code: err.code,
      detail: err.message,
    });
    return;
  }

  console.error(err);
  res.status(500).json({
    type: 'https://api.example.com/errors/internal-server-error',
    title: 'Internal Server Error',
    status: 500,
    code: 'INTERNAL_SERVER_ERROR',
    detail: 'An unexpected error occurred',
  });
}
