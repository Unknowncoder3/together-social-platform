import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const app = express();
const PORT = Number(process.env.EXPERIENCE_AI_PORT || 5003);
const SECRET = process.env.JWT_SECRET || 'together-dev-secret';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna';
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
const dataDir = path.resolve('data');
const couplesFile = path.join(dataDir, 'couples.json');
const usersFile = path.join(dataDir, 'db.json');
const sessionsFile = path.join(dataDir, 'experience-sessions.json');
const preferenceFile = path.resolve('ml/models/preference_profiles.json');
fs.mkdirSync(dataDir, { recursive: true });

const read = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };
let sessions = read(sessionsFile, { sessions: [], history: {} });
sessions.sessions ??= [];
sessions.history ??= {};
const save = () => fs.writeFileSync(sessionsFile, JSON.stringify(sessions, null, 2));
const id = () => crypto.randomUUID();
const users = () => read(usersFile, { users: [] }).users || [];
const coupleStore = () => read(couplesFile, { relationships: [], dates: [], memories: [], moments: [], moods: [] });
const couples = () => coupleStore().relationships || [];
const preferenceProfiles = () => read(preferenceFile, {});
const auth = (req, res, next) => { try { req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', '').trim(), SECRET); next(); } catch { res.status(401).json({ message: 'Authentication required' }); } };
app.use(express.json({ limit: '200kb' }));
app.get('/api/ai/health', (_, res) => res.json({ ok: true, configured: Boolean(OPENAI_API_KEY), model: OPENAI_MODEL, preferenceLearning: true }));

const clean = (value, max = 700) => String(value ?? '').replace(/[<>]/g, '').trim().slice(0, max);
const relationshipFor = uid => couples().find(r => r.userA === uid || r.userB === uid) || null;
const partnerOf = (r, uid) => r?.userA === uid ? r?.userB : r?.userA;
const contextFor = uid => {
  const rel = relationshipFor(uid);
  if (!rel) return null;
  const allUsers = users();
  const partner = allUsers.find(u => u.id === partnerOf(rel, uid));
  const c = coupleStore();
  const dates = (c.dates || []).filter(x => x.relationshipId === rel.id).slice(-20);
  const memories = (c.memories || []).filter(x => x.relationshipId === rel.id).slice(-30);
  const moments = (c.moments || []).filter(x => x.relationshipId === rel.id).slice(-30);
  const mood = (c.moods || []).find(x => x.relationshipId === rel.id) || null;
  const answers = rel.bonding?.answers || {};
  const profile = preferenceProfiles()[rel.id] || {};
  return {
    relationshipId: rel.id,
    partnerName: clean(partner?.name || 'your partner', 80),
    bondingLevel: Number(rel.bonding?.level) || 1,
    bondingAnswers: Object.values(answers).slice(0, 2).map(a => ({
      firstMeet: clean(a?.firstMeet, 500),
      togetherLength: clean(a?.togetherLength, 500),
      favoriteMemory: clean(a?.favoriteMemory, 500),
      adoreMost: clean(a?.adoreMost, 500),
      futureMoment: clean(a?.futureMoment, 500)
    })),
    dates: dates.map(x => ({ title: clean(x.title, 120), date: clean(x.date, 30), type: clean(x.type, 60), notes: clean(x.notes, 300) })),
    memories: memories.map(x => ({ title: clean(x.title, 120), description: clean(x.description, 500), date: clean(x.date, 30) })),
    moments: moments.map(x => ({ text: clean(x.text, 500), kind: clean(x.kind, 60) })),
    mood: { mood: clean(mood?.mood || 'Romantic', 50), intensity: Math.max(1, Math.min(5, Number(mood?.intensity) || 3)) },
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

const topPositive = bucket => Object.entries(bucket || {}).filter(([,v]) => Number(v) > 0).sort((a,b) => Number(b[1]) - Number(a[1])).slice(0, 6).map(([k,v]) => `${k} (${Number(v).toFixed(1)})`);
const topNegative = bucket => Object.entries(bucket || {}).filter(([,v]) => Number(v) < 0).sort((a,b) => Number(a[1]) - Number(b[1])).slice(0, 6).map(([k,v]) => `${k} (${Number(v).toFixed(1)})`);

const cosine = (a, b) => {
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) { dot += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
  return aa && bb ? dot / (Math.sqrt(aa) * Math.sqrt(bb)) : 0;
};
const openAI = async (pathname, body) => {
  if (!OPENAI_API_KEY) throw Object.assign(new Error('OPENAI_API_KEY is not configured on the server. Add it to .env and restart npm run dev.'), { status: 503 });
  const r = await fetch(`https://api.openai.com/v1${pathname}`, { method: 'POST', headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const raw = await r.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { error: { message: raw } }; }
  if (!r.ok) throw Object.assign(new Error(data?.error?.message || `OpenAI request failed (${r.status})`), { status: r.status });
  return data;
};
const responseText = data => data?.output_text || data?.output?.flatMap(x => x.content || []).find(x => x.type === 'output_text')?.text || '';
const responseJSON = async (instructions, input, schema, name) => {
  const data = await openAI('/responses', { model: OPENAI_MODEL, store: false, instructions, input, text: { format: { type: 'json_schema', name, strict: true, schema } } });
  try { return JSON.parse(responseText(data)); } catch { throw Object.assign(new Error('AI returned an invalid structured response.'), { status: 502 }); }
};
const embeddings = async texts => {
  if (!texts.length) return [];
  const data = await openAI('/embeddings', { model: EMBEDDING_MODEL, input: texts });
  return (data.data || []).sort((a, b) => a.index - b.index).map(x => x.embedding);
};

const stepSchema = { type: 'object', additionalProperties: false, properties: { kind: { type: 'string', enum: ['opening', 'question', 'choice', 'challenge', 'memory', 'reflection', 'closing'] }, title: { type: 'string' }, text: { type: 'string' }, choices: { type: 'array', items: { type: 'string' } } }, required: ['kind', 'title', 'text', 'choices'] };
const planSchema = { type: 'object', additionalProperties: false, properties: { title: { type: 'string' }, intro: { type: 'string' }, steps: { type: 'array', minItems: 3, maxItems: 6, items: stepSchema } }, required: ['title', 'intro', 'steps'] };
const nextSchema = { type: 'object', additionalProperties: false, properties: { step: stepSchema, directorNote: { type: 'string' } }, required: ['step', 'directorNote'] };
const durationSteps = minutes => minutes <= 5 ? 3 : minutes <= 15 ? 4 : minutes <= 30 ? 5 : 6;
const specialLabel = s => ({ first: 'First Date', love: 'Love Letter', memory: 'Memory Lane', dream: 'Dream Trip', chaos: 'Chaos Night', midnight: 'Midnight Mode', anniversary: 'Anniversary Night', surprise: 'Surprise Me' })[s] || 'Surprise Me';
const safeSpecial = s => ['first', 'love', 'memory', 'dream', 'chaos', 'midnight', 'anniversary', 'surprise'].includes(s) ? s : 'surprise';
const historyFor = rid => (sessions.history[rid] || []).slice(-120);
const remember = async (rid, steps) => {
  const texts = steps.map(x => clean(x.text, 700)).filter(Boolean);
  if (!texts.length) return;
  let vec = [];
  try { vec = await embeddings(texts); } catch { vec = []; }
  sessions.history[rid] ??= [];
  texts.forEach((text, i) => sessions.history[rid].push({ text, embedding: vec[i] || null, createdAt: new Date().toISOString() }));
  sessions.history[rid] = sessions.history[rid].slice(-200);
  save();
};
const recentSemantic = async (rid, texts) => {
  const old = historyFor(rid).filter(x => Array.isArray(x.embedding));
  if (!old.length || !texts.length) return texts.map(() => 0);
  try { const vec = await embeddings(texts); return vec.map(v => Math.max(...old.map(x => cosine(v, x.embedding)))); } catch { return texts.map(() => 0); }
};
const dedupeSteps = async (rid, steps) => {
  const scores = await recentSemantic(rid, steps.map(x => x.text));
  const kept = [];
  for (let i = 0; i < steps.length; i++) if (scores[i] < 0.86 || kept.length === 0) kept.push(steps[i]);
  return kept;
};
const buildPrompt = (ctx, p) => `You are the AI Date Director inside Together, a private virtual hangout for two consenting partners. Create a warm, playful, emotionally intelligent experience. Never generate graphic sexual content, coercion, humiliation, or unsafe instructions. Romantic content must remain non-graphic and optional. Either partner can skip or lower intensity. Use saved memories only as inspiration and do not expose implementation details.

RELATIONSHIP CONTEXT:\n${JSON.stringify(ctx)}\n\nSESSION:\nduration=${p.duration}; specialNight=${specialLabel(p.special)}; remainingMinutes=${p.remainingMinutes}; currentMood=${clean(p.currentMood,50)}; currentIntensity=${p.currentIntensity}/5; bondingLevel=${ctx.bondingLevel}/5.\n\nCOMPLETED THIS SESSION:\n${JSON.stringify(p.completed.slice(-12))}\n\nPREVIOUSLY USED ACTIVITIES TO AVOID:\n${JSON.stringify(p.history.slice(-60).map(x => x.text))}\n\nPERSONALIZATION RULES:\nUse positive preference signals to make the experience feel tailored. Avoid items/categories with strong negative preference signals. Do not overfit when totalFeedback is small; with fewer than 5 feedback events, treat preferences as weak hints. With 5-29 events, use them as moderate ranking signals. With 30+ events, trust repeated patterns more strongly. Never override current consent, current mood, safety, or the couple's ability to skip.\n\nMatch the mood and remaining time. If many questions were already used, switch to a choice, challenge, memory or reflection. Keep each moment short enough to use live on a call.`;

app.get('/api/ai/experience/active', auth, (req, res) => {
  const ctx = contextFor(req.user.id);
  if (!ctx) return res.status(409).json({ message: 'Connect with a partner first.' });
  const active = sessions.sessions.filter(x => x.relationshipId === ctx.relationshipId && !x.completedAt && Date.now() - new Date(x.updatedAt || x.startedAt).getTime() < 86400000).sort((a, b) => new Date(b.updatedAt || b.startedAt) - new Date(a.updatedAt || a.startedAt))[0] || null;
  res.json({ active });
});

app.post('/api/ai/experience/create', auth, async (req, res) => {
  try {
    const ctx = contextFor(req.user.id);
    if (!ctx) return res.status(409).json({ message: 'Connect with a partner first.' });
    const duration = Math.max(5, Math.min(60, Number(req.body.duration) || 30));
    const special = safeSpecial(req.body.special);
    const data = await responseJSON('Create the first section of a date-night plan. Return a title, intro and a short sequence of 3-6 moments.', buildPrompt(ctx, { duration, special, remainingMinutes: duration, currentMood: ctx.mood.mood, currentIntensity: ctx.mood.intensity, completed: [], history: historyFor(ctx.relationshipId) }), planSchema, 'together_experience');
    let steps = await dedupeSteps(ctx.relationshipId, data.steps.slice(0, durationSteps(duration)));
    if (steps.length < 3) steps = data.steps.slice(0, durationSteps(duration));
    const session = { id: id(), relationshipId: ctx.relationshipId, userId: req.user.id, title: clean(data.title, 120), intro: clean(data.intro, 500), duration, special, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), completed: [], steps };
    sessions.sessions = sessions.sessions.filter(x => x.relationshipId !== ctx.relationshipId || Date.now() - new Date(x.updatedAt || x.startedAt).getTime() < 86400000);
    sessions.sessions.push(session);
    save();
    await remember(ctx.relationshipId, steps);
    res.json({ sessionId: session.id, title: session.title, intro: session.intro, duration: session.duration, special: session.special, startedAt: session.startedAt, steps: session.steps, relationship: ctx });
  } catch (e) { res.status(e.status || 500).json({ message: e.message || 'AI experience failed.' }); }
});

app.post('/api/ai/experience/next', auth, async (req, res) => {
  try {
    const ctx = contextFor(req.user.id);
    if (!ctx) return res.status(409).json({ message: 'Connect with a partner first.' });
    const session = sessions.sessions.find(x => x.id === req.body.sessionId && x.relationshipId === ctx.relationshipId);
    if (!session) return res.status(404).json({ message: 'Experience session not found. Start a new experience.' });
    const duration = Math.max(5, Math.min(60, Number(session.duration) || 30));
    const remaining = Math.max(0, Math.min(duration, Number(req.body.remainingMinutes) || 0));
    const currentMood = clean(req.body.mood || ctx.mood.mood, 50);
    const currentIntensity = Math.max(1, Math.min(5, Number(req.body.intensity) || ctx.mood.intensity));
    const completed = Array.isArray(req.body.completed) ? req.body.completed.slice(-12).map(x => ({ kind: clean(x?.kind, 30), title: clean(x?.title, 120), text: clean(x?.text, 600) })) : session.completed;
    const data = await responseJSON('Choose the next moment in the couple experience. Return one step and a short director note explaining why it fits.', buildPrompt(ctx, { duration, special: session.special, remainingMinutes: remaining, currentMood, currentIntensity, completed, history: historyFor(ctx.relationshipId) }), nextSchema, 'together_next_moment');
    const [step] = await dedupeSteps(ctx.relationshipId, [data.step]);
    session.completed = completed;
    if (step) session.steps.push(step);
    session.updatedAt = new Date().toISOString();
    save();
    if (step) await remember(ctx.relationshipId, [step]);
    res.json({ step, directorNote: clean(data.directorNote, 400), remainingMinutes: remaining });
  } catch (e) { res.status(e.status || 500).json({ message: e.message || 'AI next-step decision failed.' }); }
});

app.post('/api/ai/experience/feedback', auth, (req, res) => {
  try {
    const ctx = contextFor(req.user.id);
    if (!ctx) return res.status(409).json({ message: 'Connect with a partner first.' });
    const allowed = new Set(['like', 'favorite', 'complete', 'skip', 'too_easy', 'too_deep', 'dislike']);
    const actions = { favorite: 1.5, like: 1.0, complete: 0.8, skip: -1.0, too_easy: -0.6, too_deep: -0.7, dislike: -1.2 };
    const action = String(req.body.action || '').trim().toLowerCase();
    if (!allowed.has(action)) return res.status(400).json({ message: 'Unsupported feedback action.' });
    const itemType = String(req.body.itemType || 'activity').trim().toLowerCase() === 'question' ? 'question' : 'activity';
    const itemId = clean(req.body.itemId, 500);
    if (!itemId) return res.status(400).json({ message: 'Feedback item is required.' });
    const category = clean(req.body.category, 80);
    const mood = clean(req.body.mood, 50);
    const intimacy = clean(req.body.intimacy, 20);
    const profiles = preferenceProfiles();
    const profile = profiles[ctx.relationshipId] || { total_feedback: 0, actions: {}, activity_scores: {}, question_scores: {}, category_scores: {}, mood_scores: {}, intimacy_scores: {} };
    const add = (bucket, key, value) => { if (!key) return; bucket[key] = Number((Number(bucket[key] || 0) + value).toFixed(4)); };
    profile.total_feedback = Number(profile.total_feedback || 0) + 1;
    add(profile.actions, action, 1);
    const weight = actions[action];
    add(itemType === 'activity' ? profile.activity_scores : profile.question_scores, itemId, weight);
    add(profile.category_scores, category, weight * 0.6);
    add(profile.mood_scores, mood, weight * 0.5);
    add(profile.intimacy_scores, intimacy, weight * 0.35);
    profiles[ctx.relationshipId] = profile;
    fs.mkdirSync(path.dirname(preferenceFile), { recursive: true });
    fs.writeFileSync(preferenceFile, JSON.stringify(profiles, null, 2));
    res.json({ ok: true, totalFeedback: profile.total_feedback, message: 'Preference saved for future experiences.' });
  } catch (e) { res.status(500).json({ message: e.message || 'Could not save preference.' }); }
});

app.post('/api/ai/experience/complete', auth, async (req, res) => {
  const ctx = contextFor(req.user.id);
  if (!ctx) return res.status(409).json({ message: 'Connect with a partner first.' });
  const session = sessions.sessions.find(x => x.id === req.body.sessionId && x.relationshipId === ctx.relationshipId);
  if (session) { session.completed = Array.isArray(req.body.completed) ? req.body.completed.slice(-20) : session.completed; session.completedAt = new Date().toISOString(); session.updatedAt = session.completedAt; save(); }
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`Together AI experience service: http://localhost:${PORT} (${OPENAI_API_KEY ? 'OpenAI configured' : 'OPENAI_API_KEY missing'})`));
