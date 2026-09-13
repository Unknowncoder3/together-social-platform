const api = async (path, options = {}) => {
  const token = localStorage.getItem('together_token') || '';
  const r = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  const raw = await r.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw }; }
  if (!r.ok) throw new Error(data.message || 'Feedback request failed');
  return data;
};

const esc = value => String(value ?? '').replace(/[&<>\"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const actions = [
  ['like', '👍 Helpful'],
  ['favorite', '❤️ Loved it'],
  ['skip', '⏭ Skip'],
  ['too_easy', '🙂 Too easy'],
  ['too_deep', '🌊 Too deep']
];

const style = `
.experienceFeedback{display:flex;flex-wrap:wrap;gap:7px;margin-top:13px;padding-top:12px;border-top:1px solid #3a2c37}
.experienceFeedback button{background:#241c25;color:#d9cbd4;border:1px solid #493846;border-radius:9px;padding:8px 10px;font-size:12px;cursor:pointer}
.experienceFeedback button:hover{border-color:#9b6782;color:#fff}
.experienceFeedback button.selected{border-color:#d99ab7;background:#392431;color:#fff}
.experienceFeedback small{width:100%;color:#897b87;font-size:11px}
`;
if (!document.querySelector('#preference-feedback-style')) {
  const st = document.createElement('style');
  st.id = 'preference-feedback-style';
  st.textContent = style;
  document.head.appendChild(st);
}

const submitFeedback = async (button, action) => {
  const step = button.closest('.directorStep');
  if (!step) return;
  const title = step.querySelector('h4')?.textContent?.trim() || 'AI moment';
  const text = step.querySelector('p')?.textContent?.trim() || '';
  const kind = step.querySelector('.kicker')?.textContent?.toLowerCase() || '';
  const itemType = kind.includes('question') ? 'question' : 'activity';
  const buttons = step.querySelectorAll('.experienceFeedback button');
  buttons.forEach(x => x.disabled = true);
  try {
    await api('/api/ai/experience/feedback', {
      method: 'POST',
      body: JSON.stringify({
        itemType,
        itemId: `${title}: ${text}`.slice(0, 500),
        action,
        category: kind.includes('question') ? 'conversation' : kind.replace(/^moment\s+\d+\s*[·-]?\s*/i, '').trim(),
        mood: document.querySelector('#liveMood')?.value || '',
        intimacy: document.querySelector('#liveIntensity')?.value || ''
      })
    });
    const selected = [...buttons].find(x => x.dataset.action === action);
    if (selected) selected.classList.add('selected');
    const note = step.querySelector('.feedbackStatus');
    if (note) note.textContent = 'Saved — the Director will use this preference in future experiences.';
  } catch (e) {
    buttons.forEach(x => x.disabled = false);
    const note = step.querySelector('.feedbackStatus');
    if (note) note.textContent = e.message;
  }
};

const injectFeedback = () => {
  document.querySelectorAll('.directorStep').forEach(step => {
    if (step.querySelector('.experienceFeedback')) return;
    const wrap = document.createElement('div');
    wrap.className = 'experienceFeedback';
    wrap.innerHTML = '<small>Help the Director learn what feels right for you two</small>' +
      actions.map(([action, label]) => `<button type="button" data-action="${action}">${esc(label)}</button>`).join('') +
      '<small class="feedbackStatus"></small>';
    wrap.querySelectorAll('button').forEach(button => {
      button.onclick = () => submitFeedback(button, button.dataset.action);
    });
    step.appendChild(wrap);
  });
};

const observer = new MutationObserver(injectFeedback);
observer.observe(document.body, { childList: true, subtree: true });
setInterval(injectFeedback, 1000);
