import { describe, expect, it } from 'vitest';
import { maskSensitiveText, safeAiProviderAccountLabel, safeApiKeyDisplayLabel } from './sensitiveDisplay';

describe('sensitive display labels', () => {
  it('keeps masked API keys and masks raw sk-style API keys', () => {
    expect(safeApiKeyDisplayLabel('sk-a*****************3456')).toBe('sk-a*****************3456');

    const masked = safeApiKeyDisplayLabel('sk-fake-key-123456');

    expect(masked).toMatch(/^sk-f\*+3456$/);
    expect(masked).not.toContain('fake-key');
    expect(masked).not.toContain('key-12');
  });

  it('does not display API key aliases or malformed mixed labels', () => {
    expect(safeApiKeyDisplayLabel('Primary Key')).toBe('-');
    expect(safeApiKeyDisplayLabel('Primary sk-fake-key-123456')).toBe('-');
    expect(safeApiKeyDisplayLabel('sk-a*****************3456 Primary Key')).toBe('-');
  });

  it('keeps only generic AI provider account labels', () => {
    expect(safeAiProviderAccountLabel('AI account 7', 0)).toBe('AI account 7');
    expect(safeAiProviderAccountLabel('codex account 1', 0)).toBe('AI account 1');
    expect(safeAiProviderAccountLabel('OpenAI Primary', 1)).toBe('AI account 2');
  });

  it('masks raw API keys embedded in arbitrary text', () => {
    const masked = maskSensitiveText('{"apiKey":"sk-fake-key-123456","ok":true}');

    expect(masked).toContain('sk-f');
    expect(masked).toContain('3456');
    expect(masked).not.toContain('fake-key');
    expect(masked).not.toContain('key-12');
  });
});
