import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./LoginPage.tsx', import.meta.url), 'utf8');
const stylesSource = readFileSync(new URL('./LoginPage.module.scss', import.meta.url), 'utf8');

describe('LoginPage password-only login', () => {
  it('submits only the admin password login flow', () => {
    expect(source).toContain('onPasswordSubmit(password)');
    expect(source).toContain("label={t('auth.password_label')}");
    expect(source).toContain('adminError || undefined');
    expect(source).not.toContain('onAPIKeySubmit');
    expect(source).not.toContain('apiKey');
    expect(source).not.toContain('LoginMode');
    expect(source).not.toContain('getLoginErrorForMode');
  });

  it('does not render access method or API Key viewer controls', () => {
    expect(source).not.toContain('auth.login_method');
    expect(source).not.toContain('auth.api_key_label');
    expect(source).not.toContain('auth.api_key_tab');
    expect(source).not.toContain('auth.api_key_login_submit');
    expect(source).not.toContain('styles.tabs');
    expect(source).not.toContain('auth.console_title');
    expect(source).not.toContain('auth.console_hint');
  });

  it('keeps the login hero concise, hides an empty subtitle, and exposes theme switching', () => {
    expect(source).toContain('styles.themeSwitcher');
    expect(source).toContain('useThemeStore');
    expect(source).toContain('loginSubtitle &&');
    expect(source).not.toContain('capabilityGrid');
    expect(source).not.toContain('capability_persistence');
  });

  it('fills the app main area instead of adding a second viewport height', () => {
    expect(stylesSource).toMatch(/\.pageShell\s*\{[\s\S]*?flex:\s*1\s+1\s+auto;/);
    expect(stylesSource).toMatch(/\.pageShell\s*\{[\s\S]*?min-height:\s*0;/);
    expect(stylesSource).not.toMatch(/\.pageShell\s*\{[\s\S]*?min-height:\s*100v?h;/);
  });
});
