export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly title: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(detail = 'Resource not found') {
    super(404, 'NOT_FOUND', 'Not Found', detail);
  }
}

export class UnauthorizedError extends AppError {
  constructor(detail = 'Authentication required') {
    super(401, 'UNAUTHORIZED', 'Unauthorized', detail);
  }
}

export class ForbiddenError extends AppError {
  constructor(detail = 'Permission denied') {
    super(403, 'FORBIDDEN', 'Forbidden', detail);
  }
}

export class ConflictError extends AppError {
  constructor(code: string, detail: string) {
    super(409, code, 'Conflict', detail);
  }
}

export class ValidationError extends AppError {
  constructor(detail: string) {
    super(400, 'VALIDATION_ERROR', 'Bad Request', detail);
  }
}

export class UnprocessableError extends AppError {
  constructor(code: string, detail: string) {
    super(422, code, 'Unprocessable Entity', detail);
  }
}
