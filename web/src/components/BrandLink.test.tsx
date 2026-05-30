import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./BrandLink.tsx', import.meta.url), 'utf8');

describe('BrandLink', () => {
  it('renders the LLMAPI usage brand as non-link text', () => {
    expect(source).toContain('LLMAPI usage');
    expect(source).not.toContain('llmapi usage');
    expect(source).toContain('<span');
    expect(source).not.toContain('<a ');
    expect(source).not.toContain('href=');
    expect(source).not.toContain('GITHUB_REPOSITORY_URL');
  });
});
