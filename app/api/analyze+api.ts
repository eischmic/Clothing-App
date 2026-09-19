import Anthropic from '@anthropic-ai/sdk';
import { coerceGarmentAttributes, coerceImageAttributes, GARMENT_SCHEMA, INSPIRATION_SCHEMA } from '@/lib/schemas';
export async function POST(request: Request): Promise<Response> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return Response.json({ error: 'missing_key', message: 'ANTHROPIC_API_KEY is not set.' }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: 'invalid_body' }, { status: 400 }); }
  const input = body as { kind?: unknown; images?: unknown };
  if ((input.kind !== 'inspiration' && input.kind !== 'wardrobe') || !Array.isArray(input.images) || input.images.length < 1 || input.images.length > 10 || !input.images.every((x) => typeof x === 'string' && x.startsWith('data:image/'))) return Response.json({ error: 'invalid_request' }, { status: 400 });
  try {
    const tool = input.kind === 'inspiration' ? { name: 'extract_inspiration', description: 'Extract a style profile from these images.', input_schema: INSPIRATION_SCHEMA } : { name: 'extract_garments', description: 'Extract garments from these images.', input_schema: GARMENT_SCHEMA };
    const client = new Anthropic({ apiKey: key });
    const content = input.images.map((image) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: image.slice(5, image.indexOf(';')) as 'image/jpeg', data: image.slice(image.indexOf(',') + 1) } }));
    const message = await client.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 1200, tools: [tool as never], tool_choice: { type: 'tool', name: tool.name }, messages: [{ role: 'user', content }] });
    const call = message.content.find((block) => block.type === 'tool_use');
    if (!call || call.type !== 'tool_use') return Response.json({ error: 'provider_error' }, { status: 502 });
    if (input.kind === 'inspiration') return Response.json({ attributes: [coerceImageAttributes(call.input)] });
    const records = call.input as { items?: unknown[] };
    return Response.json({ items: Array.isArray(records.items) ? records.items.map(coerceGarmentAttributes).filter(Boolean) : [] });
  } catch { return Response.json({ error: 'provider_error' }, { status: 502 }); }
}
