const AI_GATEWAY_API_URL = 'https://ai-gateway.vercel.sh/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'anthropic/claude-3-haiku';
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_INPUT_CHARS = 6_000;
const MAX_OUTPUT_TOKENS = 500;

export interface DeskTriageResult {
  summary: string;
  priority: 'low' | 'normal' | 'high';
  meetingIntent: {
    title: string;
    startsAt: string;
    endsAt: string;
    confidence: number;
  } | null;
  model: string;
  inputChars: number;
  outputChars: number;
}

function getModel(): string {
  const configured = String(process.env.DESK_AI_MODEL || process.env.AI_MODEL || '').trim();
  return /^[a-z0-9._-]+\/[a-z0-9._-]+$/i.test(configured) ? configured : DEFAULT_MODEL;
}

function gatewayKey(): string {
  return String(process.env.AI_GATEWAY_API_KEY || '').trim();
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function textFromGatewayPayload(payload: any): string {
  if (!payload || !Array.isArray(payload.content)) return '';
  return payload.content
    .filter((part: any) => part && part.type === 'text' && typeof part.text === 'string')
    .map((part: any) => part.text)
    .join('\n')
    .trim();
}

function parseJsonObject(raw: string): any {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced ? fenced[1] : trimmed;
  return JSON.parse(candidate);
}

function normalizeMeeting(value: any) {
  if (!value || typeof value !== 'object') return null;
  if (typeof value.title !== 'string' || typeof value.startsAt !== 'string' || typeof value.endsAt !== 'string') return null;
  const confidence = Number(value.confidence);
  const starts = Date.parse(value.startsAt);
  const ends = Date.parse(value.endsAt);
  if (!Number.isFinite(starts) || !Number.isFinite(ends) || ends <= starts) return null;
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;
  return {
    title: value.title.trim().slice(0, 180),
    startsAt: new Date(starts).toISOString(),
    endsAt: new Date(ends).toISOString(),
    confidence,
  };
}

export async function runDeskAiTriage(body: string, now = new Date()): Promise<DeskTriageResult> {
  const key = gatewayKey();
  if (!key) throw new Error('Z Desk AI Gateway credential is not configured.');

  const input = String(body || '').slice(0, MAX_INPUT_CHARS);
  const model = getModel();
  const system = [
    'You are the Z Desk triage assistant.',
    'Return ONLY one JSON object. Do not use Markdown.',
    'You provide decision support only. Never claim an action was executed.',
    'Do not infer sensitive/protected attributes, health conditions, political or religious beliefs, or other traits not explicitly needed for the message workflow.',
    'Summarize the operational meaning of the message in at most 240 characters.',
    'priority must be exactly low, normal, or high.',
    'meetingIntent must be null unless the message clearly requests/proposes a meeting or appointment with enough explicit timing evidence.',
    'Never invent a meeting date or time. If timing is ambiguous, return meetingIntent null.',
    'If a meeting exists, return ISO-8601 startsAt/endsAt and confidence from 0 to 1.',
  ].join(' ');

  const user = JSON.stringify({
    now: now.toISOString(),
    message: input,
    outputSchema: {
      summary: 'string',
      priority: 'low|normal|high',
      meetingIntent: 'null | {title:string,startsAt:string,endsAt:string,confidence:number}',
    },
  });

  const response = await fetchWithTimeout(
    AI_GATEWAY_API_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    },
    REQUEST_TIMEOUT_MS,
  );

  if (!response.ok) throw new Error(`Z Desk AI Gateway request failed with status ${response.status}.`);
  const payload = await response.json();
  const raw = textFromGatewayPayload(payload);
  if (!raw) throw new Error('Z Desk AI Gateway returned no text result.');

  const parsed = parseJsonObject(raw);
  const priority = parsed?.priority;
  if (!['low', 'normal', 'high'].includes(priority)) throw new Error('Z Desk AI returned invalid priority.');
  if (typeof parsed?.summary !== 'string') throw new Error('Z Desk AI returned invalid summary.');

  return {
    summary: parsed.summary.trim().slice(0, 240),
    priority,
    meetingIntent: normalizeMeeting(parsed.meetingIntent),
    model,
    inputChars: input.length,
    outputChars: raw.length,
  };
}

export const deskAiConstants = {
  AI_GATEWAY_API_URL,
  DEFAULT_MODEL,
  MAX_INPUT_CHARS,
  MAX_OUTPUT_TOKENS,
};
