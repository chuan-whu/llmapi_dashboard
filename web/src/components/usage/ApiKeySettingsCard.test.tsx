import React from 'react';
import '@/i18n';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ApiKeySettingsCard } from './ApiKeySettingsCard';
import type { CpaApiKeySettingsItem } from '@/lib/types';

const apiKeys: CpaApiKeySettingsItem[] = [
  { id: '9007199254740993', keyAlias: 'Primary Key', displayKey: 'sk-a*****************3456', label: 'sk-a*****************3456', lastSyncedAt: '2026-05-13T00:00:00Z' },
  { id: '9007199254740994', keyAlias: 'Backup Key', displayKey: 'sk-b*****************4321', label: 'sk-b*****************4321', lastSyncedAt: null },
];

const renderCard = (props: Partial<React.ComponentProps<typeof ApiKeySettingsCard>> = {}) => renderToStaticMarkup(
  <ApiKeySettingsCard
    apiKeys={apiKeys}
    loading={false}
    {...props}
  />,
);

describe('ApiKeySettingsCard', () => {
  it('renders masked display keys without aliases, raw keys, ids, or edit controls', () => {
    const html = renderCard();

    expect(html).toContain('API Key Settings');
    expect(html).toContain('sk-a*****************3456');
    expect(html).toContain('sk-b*****************4321');
    expect(html).not.toContain('Primary Key');
    expect(html).not.toContain('Backup Key');
    expect(html).not.toContain('9007199254740993');
    expect(html).not.toContain('Local ID');
    expect(html).not.toContain('Display note');
    expect(html).not.toContain('<input');
    expect(html).not.toContain('Save');
    expect(html).not.toContain('sk-target-secret-value');
    expect(html).not.toContain('api_key');
  });

  it('masks raw API keys and suppresses aliases even if the backend sends them', () => {
    const html = renderCard({
      apiKeys: [{
        id: 'secret-row',
        keyAlias: 'Production Alias',
        displayKey: 'sk-live-secret-value-1234567890',
        label: 'Production Alias',
        lastSyncedAt: null,
      }],
    });

    expect(html).toMatch(/sk-l\*+7890/);
    expect(html).not.toContain('sk-live-secret-value-1234567890');
    expect(html).not.toContain('Production Alias');
    expect(html).not.toContain('secret-row');
  });

  it('renders empty and loading states', () => {
    expect(renderCard({ apiKeys: [], loading: true })).toContain('Loading...');
    expect(renderCard({ apiKeys: [], loading: false })).toContain('No CPA API keys synced yet.');
  });
});
