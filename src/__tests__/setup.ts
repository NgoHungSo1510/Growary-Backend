import mongoose from 'mongoose';

process.env.JWT_SECRET = 'test-super-secret-key-growary-unit-tests-2026';
process.env.NODE_ENV = 'test';

// Prevent Mongoose queries from buffering/hanging when not connected during tests
mongoose.set('bufferCommands', false);
