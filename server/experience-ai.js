import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { spawn } from 'child_process';

// Port 5003 is kept so the existing frontend proxy/API contract does not change.
// The service is now fully local: Python loads the trained Together models and
// returns ranked decisions. No OpenAI, Groq, Gemini, or other external AI API.
const app = express();
const PORT = Number(process.env.EXPERIENCE_AI_PORT || 5003);
const SECRET = process.env.JWT_SECRET || 'together-dev-secret';
const PYTHON = process.env.PYTHON_BIN || 'python3';
const ROOT = path.resolve('.');
const dataDir = path.join(ROOT, 'data');
const couplesFile = path.join(dataDir, 'couples.json');
const usersFile = path.join(dataDir, 'db.json');
const sessionsFile = path.join(dataDir, 'experience-sessions.json');
const preferenceFile = path.join(ROOT, 'ml/models/preference_profiles.json');
fs.mkdirSync(dataDir, { recursive: true });

const read = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };
let sessions = read(sessionsFile, { sessions: [], history: {} });
sessions.sessions ??= [];
sessions.history ??= {};
const save = () => fs.writeFileSync(sessionsFile, JSON.stringify(sessions, null, 2));
const id = () => crypto.randomUUID();
const clean = (value, max = 700) => String(value ?? '').replace(/[<>]/g, '').trim().slice(0, max);
const users = () => read(usersFile, { users: [] }).users || [];
const coupleStore = () => read(couplesFile, { relationships: [], dates: [], memories: [], moments: [], moods: [] });
const couples = () => coupleStore().relationships || [];
const profiles = () => read(preferenceFile, {});
const topPositive = bucket => Object.entries(bucket || {}).filter(([,v]) => Number(v) > 0).sort((a,b) => Number(b[1]) - Number(a[1])).slice(0, 6).map(([k,v]) => `${k} (${Number(v).toFixed(1)})`);
const topNegative = bucket => Object.entries(bucket || {}).filter(([,v]) => Number(v) < 0).sort((a,b) => Number(a[1]) - Number(b[1])).slice(0, 6).map(([k,v]) => `${k} (${Number(v).toFixed(1)})`);

const auth = (req, res, next) => {
  try { req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', '').trim(), SECRET); next(); }
  catch { res.status(401).json({ message: 'Authentication required' }); }
};
app.use(express.json({ limit: '200kb' }));

const relationshipFor = uid => couples().find(r => r.userA === uid || r.userB === uid) || null;
const partnerOf = (r, uid) => r?.userA === uid ? r?.userB : r?.userA;

const contextFor = uid => {
  const rel = relationshipFor(uid);
  if (!rel) return null;
  const partner = users().find(u => u.id === partnerOf(rel, uid));
  const c = coupleStore();
  const dates = (c.dates || []).filter(x => x.relationshipId === rel.id).slice(-20);
  const memories = (c.memories || []).filter(x => x.relationshipId === rel.id).slice(-30);
  const moments = (c.moments || []).filter(x => x.relationshipId === rel.id).slice(-30);
  const mood = (c.moods || []).find(x => x.relationshipId === rel.id) || null;
  const profile = profiles()[rel.id] || {};
  const rawIntensity = Math.max(1, Math.min(5, Number(mood?.intensity) || 3));
  const moodName = clean(mood?.mood || 'romantic', 50).toLowerCase().replace(/\s+/g, '_');
  const intimacyLevel = rawIntensity >= 5 ? 'very_high' : rawIntensity >= 4 ? 'high' : rawIntensity >= 3 ? 'moderate' : rawIntensity >= 2 ? 'light' : 'none';
  const now = new Date();
  const hour = now.getHours();
  const timeOfDay = hour < 6 ? 'night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 22 ? 'evening' : 'night';
  return {
    relationshipId: rel.id,
    partnerName: clean(partner?.name || 'your partner', 80),
    relationshipStage: clean(rel.relationshipStage || 'serious', 40).toLowerCase().replace(/\s+/g, '_'),
    bondingLevel: Number(rel.bonding?.level) || 1,
    bondingAnswers: Object.values(rel.bonding?.answers || {}).slice(0, 2).map(a => ({
      firstMeet: clean(a?.firstMeet, 500), togetherLength: clean(a?.togetherLength, 500), favoriteMemory: clean(a?.favoriteMemory, 500), adoreMost: clean(a?.adoreMost, 500), futureMoment: clean(a?.futureMoment, 500)
    })),
    dates: dates.map(x => ({ title: clean(x.title, 120), date: clean(x.date, 30), type: clean(x.type, 60), notes: clean(x.notes, 300) })),
    memories: memories.map(x => ({ title: clean(x.title, 120), description: clean(x.description, 500), date: clean(x.date, 30) })),
    moments: moments.map(x => ({ text: clean(x.text, 500), kind: clean(x.kind, 60) })),
    mood: { mood: moodName, intensity: rawIntensity },
    mlContext: {
      mood: moodName,
      energy_level: rawIntensity >= 4 ? 'high' : rawIntensity <= 2 ? 'low' : 'medium',
      time_available: 30,
      time_of_day: timeOfDay,
      occasion: 'date_night',
      relationship_stage: clean(rel.relationshipStage || 'serious', 40).toLowerCase().replace(/\s+/g, '_'),
      bonding_level: Number(rel.bonding?.level) || 1,
      intimacy_level: intimacyLevel,
      couple_only: true,
      consent_required: true,
      depth: Math.max(1, Math.min(5, Number(rel.bonding?.level) || 1))
    },
    preferences: {
      totalFeedback: Number(profile.total_feedback) || 0,
      favoriteActivities: topPositive(profile.activity_scores),
      avoidedActivities: topNegative(profile.activity_scores),
      favoriteQuestions: topPositive(profile.question_scores),
      avoidedCategories: topNegative(profile.category_scores),
      moodSignals: topPositive(profile.mood_scores)
    }
  };
};

const historyFor = rid => (sessions.history[rid] || []).slice(-120);
const remember = (rid, steps) => {
  sessions.history[rid] ??= [];
  for (const step of steps) {
    const text = clean(step?.text || step?.title, 700);
    if (text) sessions.history[rid].push({ text, createdAt: new Date().toISOString(), activityId: step.activityId ?? null, questionId: step.questionId ?? null });
  }
  sessions.history[rid] = sessions.history[rid].slice(-200);
  save();
};

function runLocalModel(payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, ['ml/orchestrator.py'], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', err => reject(Object.assign(new Error(`Could not start local ML engine: ${err.message}`), { status: 500 })));
    child.on('close', code => {
      if (code !== 0) return reject(Object.assign(new Error(stderr.trim() || `Local ML engine exited with code ${code}`), { status: 500 }));
      try { resolve(JSON.parse(stdout.trim())); }
      catch { reject(Object.assign(new Error(`Local ML engine returned invalid JSON. ${stderr.trim()}`), { status: 502 })); }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

app.get('/api/ai/health', (_, res) => res.json({ ok: true, configured: true, engine: 'local-ml', externalApi: false, models: ['scene_classifier', 'activity_recommender', 'question_engine', 'preference_engine'], preferenceLearning: true }));

app.get('/api/ai/experience/active', auth, (req, res) => {
  const ctx = contextFor(req.user.id);
  if (!ctx) return res.status(409).json({ message: 'Connect with a partner first.' });
  const active = sessions.sessions.filter(x => x.relationshipId === ctx.relationshipId && !x.completedAt && Date.now() - new Date(x.updatedAt || x.startedAt).getTime() < 86400000).sort((a,b) => new Date(b.updatedAt || b.startedAt) - new Date(a.updatedAt || a.startedAt))[0] || null;
  res.json({ active });
});

app.post('/api/ai/experience/create', auth, async (req, res) => {
  try {
    const ctx = contextFor(req.user.id);
    if (!ctx) return res.status(409).json({ message: 'Connect with a partner first.' });
    const duration = Math.max(5, Math.min(60, Number(req.body.duration) || 30));
    const special = ['first','love','memory','dream','chaos','midnight','anniversary','surprise'].includes(req.body.special) ? req.body.special : 'surprise';
    const mlContext = { ...ctx.mlContext, time_available: duration, occasion: special === 'anniversary' ? 'anniversary' : special === 'first' ? 'first_date' : 'date_night' };
    const data = await runLocalModel({ action: 'create', context: mlContext, previous_questions: historyFor(ctx.relationshipId).map(x => x.text), previous_activity_ids: historyFor(ctx.relationshipId).map(x => x.activityId).filter(Boolean), steps: duration <= 5 ? 3 : duration <= 15 ? 4 : duration <= 30 ? 5 : 6 });
    const sceneTitle = String(data.scene || 'connection').replace(/_/g, ' ');
    const title = special === 'surprise' ? `Together · ${sceneTitle}` : `${special[0].toUpperCase()}${special.slice(1)} Night · ${sceneTitle}`;
    const intro = `Your local Experience Director chose this flow from the trained scene, activity and question models, your couple context, and feedback history.`;
    const session = { id: id(), relationshipId: ctx.relationshipId, userId: req.user.id, title, intro, duration, special, scene: data.scene, sceneProbabilities: data.sceneProbabilities, candidateActivities: data.candidateActivities, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), completed: [], steps: data.steps || [] };
    sessions.sessions = sessions.sessions.filter(x => x.relationshipId !== ctx.relationshipId || Date.now() - new Date(x.updatedAt || x.startedAt).getTime() < 86400000);
    sessions.sessions.push(session); save(); remember(ctx.relationshipId, session.steps);
    res.json({ sessionId: session.id, title: session.title, intro: session.intro, duration, special, startedAt: session.startedAt, steps: session.steps, relationship: ctx, engine: 'local-ml' });
  } catch (e) { res.status(e.status || 500).json({ message: e.message || 'Local experience engine failed.' }); }
});

app.post('/api/ai/experience/next', auth, async (req, res) => {
  try {
    const ctx = contextFor(req.user.id);
    if (!ctx) return res.status(409).json({ message: 'Connect with a partner first.' });
    const session = sessions.sessions.find(x => x.id === req.body.sessionId && x.relationshipId === ctx.relationshipId);
    if (!session) return res.status(404).json({ message: 'Experience session not found. Start a new experience.' });
    const remaining = Math.max(5, Math.min(60, Number(req.body.remainingMinutes) || 5));
    const currentMood = clean(req.body.mood || ctx.mood.mood, 50).toLowerCase().replace(/\s+/g, '_');
    const intensity = Math.max(1, Math.min(5, Number(req.body.intensity) || ctx.mood.intensity));
    const intimacy = intensity >= 5 ? 'very_high' : intensity >= 4 ? 'high' : intensity >= 3 ? 'moderate' : intensity >= 2 ? 'light' : 'none';
    const completed = Array.isArray(req.body.completed) ? req.body.completed.slice(-12).map(x => ({ kind: clean(x?.kind, 30), title: clean(x?.title, 120), text: clean(x?.text, 600), activityId: x?.activityId ?? null, questionId: x?.questionId ?? null })) : session.completed;
    const usedActivities = [...historyFor(ctx.relationshipId).map(x => x.activityId).filter(Boolean), ...completed.map(x => x.activityId).filter(Boolean)];
    const previousQuestions = [...historyFor(ctx.relationshipId).map(x => x.text), ...completed.filter(x => x.kind === 'question').map(x => x.title)];
    const mlContext = { ...ctx.mlContext, mood: currentMood, intimacy_level: intimacy, time_available: remaining, depth: Math.max(1, Math.min(5, Number(ctx.bondingLevel) || 1)) };
    const data = await runLocalModel({ action: 'next', context: mlContext, previous_questions: previousQuestions, used_activity_ids: usedActivities });
    const step = data.step || null;
    session.completed = completed; if (step) { session.steps.push(step); remember(ctx.relationshipId, [step]); }
    session.updatedAt = new Date().toISOString(); save();
    res.json({ step, directorNote: clean(data.directorNote, 400), remainingMinutes: remaining, scene: data.scene, sceneProbabilities: data.sceneProbabilities, engine: 'local-ml' });
  } catch (e) { res.status(e.status || 500).json({ message: e.message || 'Local experience engine failed.' }); }
});

app.post('/api/ai/experience/complete', auth, (req, res) => {
  const ctx = contextFor(req.user.id);
  if (!ctx) return res.status(409).json({ message: 'Connect with a partner first.' });
  const session = sessions.sessions.find(x => x.id === req.body.sessionId && x.relationshipId === ctx.relationshipId);
  if (!session) return res.status(404).json({ message: 'Experience session not found.' });
  if (Array.isArray(req.body.completed)) session.completed = req.body.completed.slice(-30);
  session.completedAt = new Date().toISOString(); session.updatedAt = session.completedAt; save();
  res.json({ ok: true, engine: 'local-ml' });
});

app.listen(PORT, () => console.log(`Together local ML experience service: http://localhost:${PORT}`));
