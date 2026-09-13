import fs from 'fs';
import path from 'path';
import { getPool } from './postgres.js';

const dbFile = path.resolve('data/db.json');
const originalWriteFileSync = fs.writeFileSync;
let syncQueue = Promise.resolve();
let lastMessageSnapshot = new Map();

function queueMessageSync() {
  syncQueue = syncQueue.then(async () => {
    const pool = getPool();
    if (!pool || !fs.existsSync(dbFile)) return;

    let db;
    try {
      db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
    } catch {
      return;
    }

    const messages = Array.isArray(db.messages) ? db.messages : [];
    for (const message of messages) {
      if (!message?.id || !message?.roomId || !message?.userId || !String(message.text || '').trim()) continue;
      const fingerprint = `${message.id}:${message.text}:${message.createdAt || ''}`;
      if (lastMessageSnapshot.get(message.id) === fingerprint) continue;

      try {
        await pool.query(
          `INSERT INTO messages (id, room_id, user_id, text, created_at)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::timestamptz)
           ON CONFLICT (id) DO UPDATE
           SET text = EXCLUDED.text`,
          [message.id, message.roomId, message.userId, String(message.text), message.createdAt || new Date().toISOString()]
        );
        lastMessageSnapshot.set(message.id, fingerprint);
      } catch (error) {
        // Keep JSON as the live fallback if PostgreSQL is temporarily unavailable.
        console.error('PostgreSQL live message sync failed:', error.message);
      }
    }
  }).catch(error => console.error('Message sync queue failed:', error.message));

  return syncQueue;
}

fs.writeFileSync = function patchedWriteFileSync(filename, data, ...rest) {
  const result = originalWriteFileSync.call(this, filename, data, ...rest);
  try {
    if (path.resolve(String(filename)) === dbFile) queueMessageSync();
  } catch {
    // Never break the existing JSON-backed server because of the bridge.
  }
  return result;
};

export function syncMessagesNow() {
  return queueMessageSync();
}
