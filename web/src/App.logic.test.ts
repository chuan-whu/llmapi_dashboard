import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
const appStylesSource = readFileSync(new URL('./App.css', import.meta.url), 'utf8');

describe('App read-only dashboard shell', () => {
  it('keeps password login protection before the read-only UsagePage', () => {
    expect(appSource).toContain("import { UsagePage } from './pages/UsagePage';");
    expect(appSource).toContain("import { LoginPage } from './pages/LoginPage';");
    expect(appSource).toContain('getSession');
    expect(appSource).toContain('login(password)');
    expect(appSource).toContain('<UsagePage onAuthRequired={clearSession} />');
    expect(appSource).not.toContain('KeyOverviewPage');
  });

  it('mounts the shared footer from the app shell', () => {
    expect(appSource).toContain("import './App.css';");
    expect(appSource).toContain("import { AppFooter } from './components/AppFooter';");
    expect(appSource).toMatch(/<div className="app-frame">[\s\S]*<main className="app-main">\{page\}<\/main>[\s\S]*<AppFooter \/>[\s\S]*<\/div>/);
  });

  it('lets app pages fill the space above the shared footer', () => {
    expect(appStylesSource).toMatch(/\.app-main\s*\{[\s\S]*?display:\s*flex;/);
    expect(appStylesSource).toMatch(/\.app-main\s*\{[\s\S]*?flex-direction:\s*column;/);
  });
});
