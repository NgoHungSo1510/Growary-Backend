import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
    constructor(
        public statusCode: number,
        message: string,
        public isOperational = true
    ) {
        super(message);
        this.name = 'AppError';
        Error.captureStackTrace(this, this.constructor);
    }
}

export const errorHandler = (
    err: Error | AppError,
    req: Request,
    res: Response,
    _next: NextFunction
): void => {
    const isDev = process.env.NODE_ENV === 'development';

    if (err instanceof AppError) {
        res.status(err.statusCode).json({
            error: err.message,
            ...(isDev && { stack: err.stack }),
        });
        return;
    }

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        res.status(400).json({ error: err.message });
        return;
    }

    // Mongoose cast error (invalid ObjectId)
    if (err.name === 'CastError') {
        res.status(400).json({ error: 'Invalid ID format' });
        return;
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        res.status(401).json({ error: 'Invalid token' });
        return;
    }

    if (err.name === 'TokenExpiredError') {
        res.status(401).json({ error: 'Token expired' });
        return;
    }

    // Default — unexpected error
    console.error('❌ Unhandled Error:', err);
    res.status(500).json({
        error: 'Internal server error',
        ...(isDev && { message: err.message, stack: err.stack }),
    });
};
