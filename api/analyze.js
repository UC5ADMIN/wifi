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
    const system        = body.system      || '';
    const userText      = body.userText    || '';
    const imageB64      = body.imageB64    || null;
    const imageMime     = body.imageMime   || 'image/jpeg';
    const maxTokens     = body.maxTokens   || 800;
    const useSearch     = body.useSearch   || false;
    const modelOverride = body.model       || null;

    const combinedText = system ? `${system}\n\n${userText}` : userText;

    const messages = [];
    if (imageB64) {
      messages.push({
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${imageMime};base64,${imageB64}` } },
          { type: 'text', text: combinedText },
        ],
      });
    } else {
      messages.push({ role: 'user', content: combinedText });
    }

    let model;
    if (modelOverride)  { model = modelOverride; }
    else if (imageB64)  { model = 'meta-llama/llama-4-scout-17b-16e-instruct'; }
    else                { model = 'llama-3.3-70b-versatile'; }

    const baseRequest = {
      model,
      max_tokens: maxTokens,
      temperature: 0.1,
    };

    if (useSearch && !imageB64) {
      baseRequest.tools = [{
        type: 'function',
        function: {
          name: 'web_search',
          description: 'Search the web for current accurate product specifications.',
          parameters: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query'],
          },
        },
      }];
      baseRequest.tool_choice = 'auto';
    }

    let loopMessages = [...messages];
    let finalText = '';
    const MAX_ROUNDS = 5;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ ...baseRequest, messages: loopMessages }),
      });

      const data = await upstream.json();
      if (!upstream.ok) return res.status(upstream.status).json({ error: data.error?.message || 'Groq API error' });

      const choice = data.choices?.[0];
      const msg    = choice?.message;

      if (msg?.tool_calls && msg.tool_calls.length > 0) {
        loopMessages.push({ role: 'assistant', content: msg.content || null, tool_calls: msg.tool_calls });

        for (const tc of msg.tool_calls) {
          let toolResult = 'No result.';
          if (tc.function?.name === 'web_search') {
            try {
              const args  = JSON.parse(tc.function.arguments || '{}');
              const query = args.query || '';
              // Use a second Groq call to simulate web search grounding
              const sr = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                  model: 'llama-3.3-70b-versatile',
                  messages: [{
                    role: 'user',
                    content: `You are a product spec database assistant. Provide the most accurate known technical specifications for the following query. Be specific about model numbers, chipsets, antenna counts, and WiFi standards. Query: ${query}`,
                  }],
                  max_tokens: 800,
                  temperature: 0.1,
                }),
              });
              const sd = await sr.json();
              toolResult = sd.choices?.[0]?.message?.content || 'No data found.';
            } catch(e) {
              toolResult = `Lookup failed: ${e.message}`;
            }
          }
          loopMessages.push({ role: 'tool', tool_call_id: tc.id, content: toolResult });
        }
        continue;
      }

      finalText = msg?.content || '';
      break;
    }

    return res.status(200).json({ text: finalText });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
