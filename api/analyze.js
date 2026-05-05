export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GROQ_API_KEY not configured on server' });

  try {
    const { system, userText, imageB64, imageMime, maxTokens } = req.body;

    // Build messages — Groq supports vision via llama-3.2-90b-vision-preview
    const userContent = [];

    if (imageB64) {
      userContent.push({
        type: 'image_url',
        image_url: {
          url: `data:${imageMime || 'image/jpeg'};base64,${imageB64}`,
        },
      });
    }

    userContent.push({ type: 'text', text: userText });

    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: userContent });

    // Use vision model when image is present, fast model otherwise
    const model = imageB64
      ? 'meta-llama/llama-4-scout-17b-16e-instruct'
      : 'llama-3.3-70b-versatile';

    const groqBody = {
      model,
      messages,
      max_tokens: maxTokens || 800,
      temperature: 0.2,
    };

    const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(groqBody),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: data.error?.message || 'Groq API error',
      });
    }

    const text = data.choices?.[0]?.message?.content || '';
    return res.status(200).json({ text });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
