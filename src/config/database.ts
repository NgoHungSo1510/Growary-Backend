import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/growary';

export const connectDB = async (): Promise<void> => {
    try {
        const conn = await mongoose.connect(MONGODB_URI, {
            maxPoolSize: 10,             // Max 10 concurrent connections
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            family: 4,                   // Force IPv4 — avoids DNS issues on some cloud providers
        });
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        process.exit(1);
    }
};

mongoose.connection.on('disconnected', () => {
    console.log('⚠️ MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB error:', err);
});

export default mongoose;
