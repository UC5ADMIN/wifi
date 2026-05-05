export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GROQ_API_KEY not configured on server' });

  try {
    const body = req.body;
    const system = body.system || '';
    const userText = body.userText || '';
    const imageB64 = body.imageB64 || null;
    const imageMime = body.imageMime || 'image/jpeg';
    const maxTokens = body.maxTokens || 800;

    // Merge system + user into one combined prompt string
    const combinedText = system ? `${system}\n\n${userText}` : userText;

    const messages = [];

    if (imageB64) {
      // Vision request — image + text as array
      messages.push({
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:${imageMime};base64,${imageB64}`,
            },
          },
          {
            type: 'text',
            text: combinedText,
          },
        ],
      });
    } else {
      // Text-only — plain string, no array
      messages.push({
        role: 'user',
        content: combinedText,
      });
    }

    const model = imageB64
      ? 'meta-llama/llama-4-scout-17b-16e-instruct'
      : 'llama-3.3-70b-versatile';

    const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.2,
      }),
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
