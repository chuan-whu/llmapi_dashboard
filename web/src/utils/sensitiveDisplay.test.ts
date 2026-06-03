import { describe, expect, it } from 'vitest';
import { maskSensitiveText, safeAiProviderAccountLabel, safeApiKeyDisplayLabel } from './sensitiveDisplay';

describe('sensitive display labels', () => {
  it('keeps masked API keys and masks raw sk-style API keys', () => {
    expect(safeApiKeyDisplayLabel('sk-a*****************3456')).toBe('sk-a*****************3456');

    const masked = safeApiKeyDisplayLabel('sk-live-secret-value-1234567890');

    expect(masked).toMatch(/^sk-l\*+7890$/);
    expect(masked).not.toContain('live-secret');
    expect(masked).not.toContain('value-123456');
  });

  it('does not display API key aliases or malformed mixed labels', () => {
    expect(safeApiKeyDisplayLabel('Primary Key')).toBe('-');
    expect(safeApiKeyDisplayLabel('Primary sk-live-secret-value')).toBe('-');
    expect(safeApiKeyDisplayLabel('sk-a*****************3456 Primary Key')).toBe('-');
  });

  it('keeps only generic AI provider account labels', () => {
    expect(safeAiProviderAccountLabel('AI account 7', 0)).toBe('AI account 7');
    expect(safeAiProviderAccountLabel('codex account 1', 0)).toBe('AI account 1');
    expect(safeAiProviderAccountLabel('OpenAI Primary', 1)).toBe('AI account 2');
  });

  it('masks raw API keys embedded in arbitrary text', () => {
    const masked = maskSensitiveText('{"apiKey":"sk-live-secret-value-1234567890","ok":true}');

    expect(masked).toContain('sk-l');
    expect(masked).toContain('7890');
    expect(masked).not.toContain('live-secret');
    expect(masked).not.toContain('value-123456');
  });
});
