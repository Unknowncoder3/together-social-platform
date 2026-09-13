import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getPool, checkPostgres } from './postgres.js';

try {
  if (typeof process.loadEnvFile === 'function') process.loadEnvFile('.env');
} catch {
  // Production supplies environment variables directly.
}

const originalPost = express.application.post;
const originalGet = express.application.get;
const originalPatch = express.application.patch;
const dir = path.resolve('data');
const file = path.join(dir, 'db.json');
fs.mkdirSync(dir, { recursive: true });

const loadJsonDb = () => fs.existsSync(file)
  ? JSON.parse(fs.readFileSync(file, 'utf8'))
  : { users: [], friends: [], rooms: [], messages: [], questions: [] };
const saveJsonDb = db => fs.writeFileSync(file, JSON.stringify(db, null, 2));
const pub = u => ({ id: u.id, name: u.name, email: u.email, bio: u.bio || '' });
const secret = () => process.env.JWT_SECRET || 'together-dev-secret';
const tokenFor = u => jwt.sign({ id: u.id }, secret(), { expiresIn: '7d' });
const auth = (req, res, next) => {
  try {
    req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', '').trim(), secret());
    next();
  } catch {
    res.status(401).json({ message: 'Authentication required' });
  }
};

async function migrateUsers() {
  const status = await checkPostgres();
  if (!status.ok) return;
  const pool = getPool();
  const db = loadJsonDb();
  for (const user of db.users || []) {
    if (!user?.id || !user?.email || !user?.password) continue;
    await pool.query(
      `INSERT INTO users (id, name, email, password_hash, bio)
       VALUES ($1::uuid, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE
       SET name = EXCLUDED.name, bio = EXCLUDED.bio`,
      [user.id, user.name || '', String(user.email).toLowerCase().trim(), user.password, user.bio || '']
    );
  }
}

await migrateUsers();

express.application.post = function(pathname, ...handlers) {
  if (pathname === '/api/auth/register') {
    return originalPost.call(this, pathname, async (req, res) => {
      const { name, email, password } = req.body || {};
      if (!name || !email || !password || password.length < 6) {
        return res.status(400).json({ message: 'Name, email and a 6+ character password are required.' });
      }
      const normalizedEmail = String(email).toLowerCase().trim();
      const pool = getPool();
      if (!pool) return res.status(503).json({ message: 'Database unavailable. Please try again.' });
      try {
        const existing = await pool.query('SELECT id FROM users WHERE email=$1', [normalizedEmail]);
        if (existing.rowCount) return res.status(409).json({ message: 'Email already registered.' });
        const user = {
          id: crypto.randomUUID(), name: String(name).trim(), email: normalizedEmail,
          password: await bcrypt.hash(password, 10), bio: ''
        };
        await pool.query(
          'INSERT INTO users (id,name,email,password_hash,bio) VALUES ($1::uuid,$2,$3,$4,$5)',
          [user.id, user.name, user.email, user.password, user.bio]
        );
        const db = loadJsonDb();
        db.users ||= [];
        db.users.push(user); // temporary dual-write for remaining JSON-backed features
        saveJsonDb(db);
        return res.status(201).json({ token: tokenFor(user), user: pub(user) });
      } catch (error) {
        if (error.code === '23505') return res.status(409).json({ message: 'Email already registered.' });
        console.error('PostgreSQL registration failed:', error.message);
        return res.status(503).json({ message: 'Database unavailable. Please try again.' });
      }
    });
  }
  if (pathname === '/api/auth/login') {
    return originalPost.call(this, pathname, async (req, res) => {
      const normalizedEmail = String(req.body?.email || '').toLowerCase().trim();
      const password = req.body?.password || '';
      const pool = getPool();
      if (!pool) return res.status(503).json({ message: 'Database unavailable. Please try again.' });
      try {
        const result = await pool.query(
          'SELECT id,name,email,password_hash,bio FROM users WHERE email=$1', [normalizedEmail]
        );
        const row = result.rows[0];
        if (!row || !(await bcrypt.compare(password, row.password_hash))) {
          return res.status(401).json({ message: 'Invalid email or password.' });
        }
        const user = { id: row.id, name: row.name, email: row.email, bio: row.bio || '' };
        return res.json({ token: tokenFor(user), user: pub(user) });
      } catch (error) {
        console.error('PostgreSQL login failed:', error.message);
        return res.status(503).json({ message: 'Database unavailable. Please try again.' });
      }
    });
  }
  return originalPost.call(this, pathname, ...handlers);
};

express.application.get = function(pathname, ...handlers) {
  if (pathname === '/api/me') {
    return originalGet.call(this, pathname, auth, async (req, res) => {
      try {
        const pool = getPool();
        if (!pool) return res.status(503).json({ message: 'Database unavailable.' });
        const result = await pool.query('SELECT id,name,email,bio FROM users WHERE id=$1::uuid', [req.user.id]);
        const user = result.rows[0];
        if (!user) return res.status(404).json({ message: 'User not found.' });
        res.json({ user: pub(user) });
      } catch (error) {
        console.error('PostgreSQL /api/me failed:', error.message);
        res.status(503).json({ message: 'Database unavailable.' });
      }
    });
  }
  if (pathname === '/api/users/search') {
    return originalGet.call(this, pathname, auth, async (req, res) => {
      try {
        const pool = getPool();
        if (!pool) return res.status(503).json({ message: 'Database unavailable.' });
        const q = `%${String(req.query.q || '').toLowerCase()}%`;
        const result = await pool.query(
          `SELECT id,name,email,bio FROM users
           WHERE id <> $1::uuid AND (LOWER(name) LIKE $2 OR LOWER(email) LIKE $2)
           ORDER BY name LIMIT 20`, [req.user.id, q]
        );
        res.json(result.rows.map(pub));
      } catch (error) {
        console.error('PostgreSQL user search failed:', error.message);
        res.status(503).json({ message: 'Database unavailable.' });
      }
    });
  }
  return originalGet.call(this, pathname, ...handlers);
};

express.application.patch = function(pathname, ...handlers) {
  if (pathname === '/api/me') {
    return originalPatch.call(this, pathname, auth, async (req, res) => {
      try {
        const pool = getPool();
        if (!pool) return res.status(503).json({ message: 'Database unavailable.' });
        const current = await pool.query('SELECT id,name,email,bio FROM users WHERE id=$1::uuid', [req.user.id]);
        const user = current.rows[0];
        if (!user) return res.status(404).json({ message: 'User not found.' });
        const name = String(req.body?.name || user.name).trim();
        const bio = String(req.body?.bio ?? user.bio ?? '');
        const result = await pool.query(
          'UPDATE users SET name=$1,bio=$2 WHERE id=$3::uuid RETURNING id,name,email,bio',
          [name, bio, req.user.id]
        );
        const db = loadJsonDb();
        const local = db.users?.find(u => u.id === req.user.id);
        if (local) { local.name = name; local.bio = bio; saveJsonDb(db); }
        res.json({ user: pub(result.rows[0]) });
      } catch (error) {
        console.error('PostgreSQL profile update failed:', error.message);
        res.status(503).json({ message: 'Database unavailable.' });
      }
    });
  }
  return originalPatch.call(this, pathname, ...handlers);
};

await import('./index.js');
