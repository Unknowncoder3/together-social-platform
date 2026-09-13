export async function generateQuestionVariant({ question, category = 'General' }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const prompt = `You are the AI question engine for a private social hangout app. Create one fresh, friendly, non-explicit question inspired by this user question. Category: ${category}. Original: ${question}. Return only the new question. Avoid repeating the original wording.`;
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=' + encodeURIComponent(key), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  if (!response.ok) throw new Error('AI generation failed');
  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.map(x => x.text || '').join('').trim() || null;
}
