import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import '@/i18n';
import { ModelInfoPanel, mergeModelPricingRows } from './ModelInfoPanel';

describe('mergeModelPricingRows', () => {
  it('merges available models with saved prices and defaults missing prices to zero', () => {
    const rows = mergeModelPricingRows(
      ['gpt-5', 'gpt-5-mini'],
      [{ model: 'gpt-5', prompt_price_per_1m: 1.25, completion_price_per_1m: 5.5, cache_price_per_1m: 0.2 }],
    );

    expect(rows).toEqual([
      { model: 'gpt-5', prompt: 1.25, completion: 5.5, cache: 0.2 },
      { model: 'gpt-5-mini', prompt: 0, completion: 0, cache: 0 },
    ]);
  });
});

describe('ModelInfoPanel', () => {
  it('renders available models and the read-only model price table', () => {
    const html = renderToStaticMarkup(
      <ModelInfoPanel
        availableModels={['gpt-5', 'gpt-5-mini']}
        pricing={[{ model: 'gpt-5', prompt_price_per_1m: 1.25, completion_price_per_1m: 5.5, cache_price_per_1m: 0.2 }]}
        loading={false}
      />,
    );

    expect(html).toContain('Available Models');
    expect(html).toContain('Model Price Table');
    expect(html).toContain('gpt-5-mini');
    expect(html).toContain('$0');
    expect(html).toContain('$1.25');
    expect(html).toContain('$5.5');
    expect(html).toContain('$0.2');
  });
});
