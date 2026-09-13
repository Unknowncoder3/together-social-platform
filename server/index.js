import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 5001;
const SECRET = process.env.JWT_SECRET || 'together-dev-secret';

const dir = path.resolve('data');
const file = path.join(dir, 'db.json');
fs.mkdirSync(dir, { recursive: true });

let db = fs.existsSync(file)
  ? JSON.parse(fs.readFileSync(file, 'utf8'))
  : { users: [], friends: [], rooms: [], messages: [] };

db.users ||= [];
db.friends ||= [];
db.rooms ||= [];
db.messages ||= [];

const save = () => fs.writeFileSync(file, JSON.stringify(db, null, 2));
const id = () => crypto.randomUUID();
const roomCode = () => crypto.randomBytes(5).toString('hex').toUpperCase();
const uniqueRoomCode = () => {
  let code;
  do code = roomCode();
  while (db.rooms.some(r => r.code === code));
  return code;
};

let changed = false;
for (const room of db.rooms) {
  if (!room.code) {
    room.code = uniqueRoomCode();
    changed = true;
  }
}
if (changed) save();

const pub = u => ({ id: u.id, name: u.name, email: u.email, bio: u.bio || '' });
const auth = (req, res, next) => {
  try {
    req.user = jwt.verify(
      (req.headers.authorization || '').replace('Bearer ', '').trim(),
      SECRET
    );
    next();
  } catch {
    res.status(401).json({ message: 'Authentication required' });
  }
};

app.use(express.json());
app.get('/api/health', (_, res) => res.json({ ok: true }));

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 6) {
    return res.status(400).json({ message: 'Name, email and a 6+ character password are required.' });
  }
  const normalizedEmail = email.toLowerCase().trim();
  if (db.users.some(u => u.email === normalizedEmail)) {
    return res.status(409).json({ message: 'Email already registered.' });
  }
  const u = {
    id: id(),
    name: name.trim(),
    email: normalizedEmail,
    password: await bcrypt.hash(password, 10),
    bio: ''
  };
  db.users.push(u);
  save();
  res.status(201).json({
    token: jwt.sign({ id: u.id }, SECRET, { expiresIn: '7d' }),
    user: pub(u)
  });
});

app.post('/api/auth/login', async (req, res) => {
  const u = db.users.find(x => x.email === String(req.body.email || '').toLowerCase().trim());
  if (!u || !(await bcrypt.compare(req.body.password || '', u.password))) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }
  res.json({
    token: jwt.sign({ id: u.id }, SECRET, { expiresIn: '7d' }),
    user: pub(u)
  });
});

app.get('/api/me', auth, (req, res) => {
  const u = db.users.find(x => x.id === req.user.id);
  if (!u) return res.status(404).json({ message: 'User not found.' });
  res.json({ user: pub(u) });
});

app.patch('/api/me', auth, (req, res) => {
  const u = db.users.find(x => x.id === req.user.id);
  if (!u) return res.status(404).json({ message: 'User not found.' });
  u.name = String(req.body.name || u.name).trim();
  u.bio = String(req.body.bio ?? u.bio);
  save();
  res.json({ user: pub(u) });
});

app.get('/api/users/search', auth, (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  res.json(
    db.users
      .filter(u => u.id !== req.user.id && (u.name.toLowerCase().includes(q) || u.email.includes(q)))
      .slice(0, 20)
      .map(pub)
  );
});

app.get('/api/friends', auth, (req, res) => {
  const mine = db.friends.filter(
    f => f.status === 'accepted' && (f.from === req.user.id || f.to === req.user.id)
  );
  const requests = db.friends.filter(f => f.status === 'pending' && f.to === req.user.id);
  const other = f => pub(db.users.find(u => u.id === (f.from === req.user.id ? f.to : f.from)));
  res.json({
    friends: mine.map(other),
    requests: requests.map(f => ({ id: f.id, user: pub(db.users.find(u => u.id === f.from)) }))
  });
});

app.post('/api/friends/request/:userId', auth, (req, res) => {
  const other = req.params.userId;
  if (!db.users.some(u => u.id === other) || other === req.user.id) {
    return res.status(400).json({ message: 'Invalid user.' });
  }
  if (db.friends.some(f =>
    (f.from === req.user.id && f.to === other) ||
    (f.from === other && f.to === req.user.id)
  )) {
    return res.status(409).json({ message: 'Friend request already exists.' });
  }
  db.friends.push({ id: id(), from: req.user.id, to: other, status: 'pending' });
  save();
  res.status(201).json({ message: 'Friend request sent.' });
});

app.post('/api/friends/:requestId/accept', auth, (req, res) => {
  const f = db.friends.find(x => x.id === req.params.requestId && x.to === req.user.id);
  if (!f) return res.status(404).json({ message: 'Request not found.' });
  f.status = 'accepted';
  save();
  res.json({ message: 'Accepted.' });
});

app.get('/api/rooms', auth, (req, res) => {
  res.json({
    rooms: db.rooms
      .filter(r => r.members.includes(req.user.id))
      .map(r => ({ ...r, code: r.code }))
  });
});

app.post('/api/rooms', auth, (req, res) => {
  const r = {
    id: id(),
    code: uniqueRoomCode(),
    name: String(req.body.name || 'Together Room').trim(),
    owner: req.user.id,
    members: [req.user.id],
    createdAt: new Date().toISOString()
  };
  db.rooms.push(r);
  save();
  res.status(201).json({ room: r });
});

app.post('/api/rooms/:roomId/join', auth, (req, res) => {
  const key = String(req.params.roomId || '').trim();
  const r = db.rooms.find(x => x.id === key || x.code === key.toUpperCase());
  if (!r) return res.status(404).json({ message: 'Room not found. Check the room code.' });
  if (!r.members.includes(req.user.id)) r.members.push(req.user.id);
  save();
  res.json({ room: r });
});

app.get('/api/rooms/:roomId/messages', auth, (req, res) => {
  const r = db.rooms.find(x => x.id === req.params.roomId && x.members.includes(req.user.id));
  if (!r) return res.status(403).json({ message: 'You are not a member of this room.' });
  res.json({ messages: db.messages.filter(m => m.roomId === r.id).slice(-100) });
});

const online = new Map();
io.use((s, next) => {
  try {
    s.user = jwt.verify(s.handshake.auth.token, SECRET);
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});

io.on('connection', s => {
  const uid = s.user.id;
  online.set(uid, (online.get(uid) || 0) + 1);
  s.broadcast.emit('presence', { userId: uid, online: true });

  s.on('room:join', rid => {
    const r = db.rooms.find(x => x.id === rid && x.members.includes(uid));
    if (!r) return;
    s.join(rid);
    const peers = [...io.sockets.adapter.rooms.get(rid) || []]
      .filter(x => x !== s.id)
      .map(x => io.sockets.sockets.get(x)?.user.id)
      .filter(Boolean);
    s.emit('room:users', peers);
    s.to(rid).emit('room:notice', {
      text: `${db.users.find(u => u.id === uid)?.name || 'Someone'} joined the room.`
    });
  });

  s.on('chat:send', ({ roomId, text }) => {
    const r = db.rooms.find(x => x.id === roomId && x.members.includes(uid));
    if (!r || !String(text || '').trim()) return;
    const m = {
      id: id(),
      roomId,
      userId: uid,
      userName: db.users.find(u => u.id === uid)?.name || 'User',
      text: String(text).trim(),
      createdAt: new Date().toISOString()
    };
    db.messages.push(m);
    save();
    io.to(roomId).emit('chat:message', m);
  });

  s.on('webrtc:signal', ({ roomId, target, data }) => {
    if (target) {
      for (const [socketId, socket] of io.sockets.sockets) {
        if (socket.user?.id === target) {
          socket.emit('webrtc:signal', { from: uid, data });
          return;
        }
      }
    }
    s.to(roomId).emit('webrtc:signal', { from: uid, data });
  });

  s.on('room:reaction', ({ roomId, emoji }) => {
    s.to(roomId).emit('room:reaction', { userId: uid, emoji });
  });

  s.on('disconnect', () => {
    const n = (online.get(uid) || 1) - 1;
    n ? online.set(uid, n) : online.delete(uid);
    s.broadcast.emit('presence', { userId: uid, online: n > 0 });
  });
});

server.listen(PORT, () => console.log(`Together server: http://localhost:${PORT}`));
