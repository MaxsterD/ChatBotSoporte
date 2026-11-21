export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, message: string, code = 'api_error', details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new ApiError(400, message, 'bad_request', details);

export const unauthorized = (message = 'Sesión no válida o expirada') =>
  new ApiError(401, message, 'unauthorized');

export const forbidden = (message = 'No tienes permiso para esta acción') =>
  new ApiError(403, message, 'forbidden');

export const notFound = (message = 'Recurso no encontrado') =>
  new ApiError(404, message, 'not_found');

export const conflict = (message: string, details?: unknown) =>
  new ApiError(409, message, 'conflict', details);
