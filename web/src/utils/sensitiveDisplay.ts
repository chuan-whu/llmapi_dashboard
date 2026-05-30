const RAW_API_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]{12,}\b/;
const MASKED_API_KEY_PATTERN = /^sk-[A-Za-z0-9][*]{4,}[A-Za-z0-9_-]{4}$/;
const GENERIC_AI_ACCOUNT_PATTERN = /^AI account \d+$/;

const normalizeDisplayText = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

export function maskApiKey(value: string): string {
  const trimmed = value.trim();
  const match = RAW_API_KEY_PATTERN.exec(trimmed);
  if (!match) {
    return '';
  }
  const key = match[0];
  const prefix = key.slice(0, 4);
  const suffix = key.slice(-4);
  const starCount = Math.max(12, key.length - prefix.length - suffix.length);
  return `${prefix}${'*'.repeat(starCount)}${suffix}`;
}

export function safeApiKeyDisplayLabel(value: unknown, fallback = '-'): string {
  const trimmed = normalizeDisplayText(value);
  if (!trimmed) {
    return fallback;
  }
  if (MASKED_API_KEY_PATTERN.test(trimmed)) {
    return trimmed;
  }
  if (RAW_API_KEY_PATTERN.test(trimmed)) {
    const rawKey = RAW_API_KEY_PATTERN.exec(trimmed)?.[0] ?? '';
    return rawKey === trimmed ? maskApiKey(trimmed) || fallback : fallback;
  }
  return fallback;
}

export function safeAiProviderAccountLabel(value: unknown, index: number): string {
  const trimmed = normalizeDisplayText(value);
  if (GENERIC_AI_ACCOUNT_PATTERN.test(trimmed)) {
    return trimmed;
  }
  return `AI account ${index + 1}`;
}
