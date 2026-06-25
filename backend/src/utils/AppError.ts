export class AppError extends Error {
    public statusCode: number;
    public isOperational: boolean;
  
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
      this.isOperational = true; // Distinguishes operational errors from programming bugs
      Error.captureStackTrace(this, this.constructor);
    }
  }