import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/growary';
const NEW_PASSWORD = 'admin123';

async function resetAllUsersPassword() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;
  if (!db) throw new Error('Database not ready');

  const usersCol = db.collection('users');
  const users = await usersCol
    .find({}, { projection: { email: 1, username: 1, role: 1 } })
    .toArray();

  if (users.length === 0) {
    console.log('No users found');
    await mongoose.disconnect();
    return;
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(NEW_PASSWORD, salt);

  const ids = users.map((u) => u._id);
  await usersCol.updateMany(
    { _id: { $in: ids } },
    {
      $set: {
        password: hashedPassword,
        updatedAt: new Date(),
      },
    }
  );

  const result = users.map((u) => ({
    email: u.email,
    username: u.username,
    role: u.role,
    plainPassword: NEW_PASSWORD,
    status: 'updated',
  }));

  console.log('\nRESET RESULT (save securely):');
  console.table(result);
  console.log('\nJSON OUTPUT:');
  console.log(JSON.stringify(result, null, 2));

  await mongoose.disconnect();
  console.log('\nDone');
}

resetAllUsersPassword().catch((err) => {
  console.error('Reset failed:', err);
  process.exit(1);
});
