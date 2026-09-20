import Anthropic from '@anthropic-ai/sdk';

export async function POST(request: Request): Promise<Response> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return Response.json({ error: 'missing_key' }, { status: 503 });
  let body: { recommendation?: { product?: { name?: string }; scores?: Record<string, number>; newOutfits?: number } };
  try { body = await request.json(); } catch { return Response.json({ error: 'invalid_body' }, { status: 400 }); }
  if (!body.recommendation?.product || !body.recommendation?.scores) return Response.json({ error: 'invalid_request' }, { status: 400 });
  try {
    const rec = body.recommendation;
    const product = rec.product!;
    const scores = rec.scores!;
    const prompt = `Give exactly three concise second-person reasons (max 90 characters each) for recommending ${product.name ?? 'this piece'}. Style score: ${Math.round((scores.style ?? 0) * 100)}%. New outfits: ${rec.newOutfits ?? 0}. Return one reason per line, no bullets.`;
    const client = new Anthropic({ apiKey: key });
    const message = await client.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 180, messages: [{ role: 'user', content: prompt }] });
    const text = message.content.find((block) => block.type === 'text');
    const reasons = text?.type === 'text' ? text.text.split('\n').map((line) => line.replace(/^[-•\d.\s]+/, '').trim()).filter(Boolean).slice(0, 3).map((line) => line.slice(0, 90)) : [];
    return Response.json({ reasons });
  } catch { return Response.json({ error: 'provider_error' }, { status: 502 }); }
}
