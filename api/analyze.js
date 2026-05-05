export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured on server' });

  try {
    const { system, userText, imageB64, imageMime, maxTokens } = req.body;

    const parts = [];
    if (imageB64) {
      parts.push({ inline_data: { mime_type: imageMime || 'image/jpeg', data: imageB64 } });
    }
    parts.push({ text: system ? `${system}\n\n${userText}` : userText });

    const geminiBody = {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        maxOutputTokens: maxTokens || 800,
        temperature: 0.2,
      },
    };

    const upstream = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
      }
    );

    const data = await upstream.json();

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: data.error?.message || 'Gemini API error' });
    }

    const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    return res.status(200).json({ text });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
