/**
 * Migration 004: Export & Drop SystemLog Collection
 *
 * System logs have been completely moved to Winston structured logger.
 * This migration exports any legacy SystemLog documents to a local JSON archive
 * and drops the SystemLog collection, freeing database resources.
 *
 * Usage:
 *   node scripts/migrations/004-export-system-logs.js
 */
import fs from 'fs/promises';
import path from 'path';
import mongoose from 'mongoose';
import config from '../../src/core/config/env.js';

const migrate = async () => {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(config.MONGO_URI);

  const db = mongoose.connection.db;
  const collections = await db.listCollections({ name: 'systemlogs' }).toArray();

  if (collections.length === 0) {
    console.log('SystemLog collection does not exist or has already been dropped. Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  const systemLogs = await db.collection('systemlogs').find({}).toArray();
  console.log(`Found ${systemLogs.length} legacy SystemLog documents.`);

  if (systemLogs.length > 0) {
    const backupDir = path.resolve('backups');
    await fs.mkdir(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `systemlogs_archive_${Date.now()}.json`);
    await fs.writeFile(backupPath, JSON.stringify(systemLogs, null, 2));
    console.log(`✓ Archived legacy logs to ${backupPath}`);
  }

  await db.dropCollection('systemlogs');
  console.log('✓ Successfully dropped legacy systemlogs collection.');

  await mongoose.disconnect();
};

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
