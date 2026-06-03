import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import '@/i18n';
import { ModelInfoPanel, mergeModelPricingRows, presentOhMyGPTQueryResponse } from './ModelInfoPanel';

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
        onApiKeyQuery={async () => ({})}
      />,
    );

    expect(html).toContain('codex可用模型');
    expect(html).toContain('codex可用模型价格表');
    expect(html).toContain('gpt-5-mini');
    expect(html).toContain('$0');
    expect(html).toContain('$1.25');
    expect(html).toContain('$5.5');
    expect(html).toContain('$0.2');
  });

  it('renders an API key model query form below model information', () => {
    const html = renderToStaticMarkup(
      <ModelInfoPanel
        availableModels={[]}
        pricing={[]}
        loading={false}
        onApiKeyQuery={async () => ({})}
      />,
    );

    expect(html).toContain('Oh My GPT额度与可用模型查询');
    expect(html).toContain('请输入你的API KEY');
    expect(html).toContain('Codex的额度是共享的，这里只能查询自己的Oh My GPT额度。可点击顶部使用教程按钮查看详情。');
    expect(html).not.toContain('API Key Query');
    expect(html).toContain('查询');
    expect(html).toContain('type="password"');
  });

  it('formats Oh My GPT quota records with semantic labels and Beijing time', () => {
    const viewModel = presentOhMyGPTQueryResponse({
      statusCode: 200,
      message: 'Get api keys success, total keys: 1',
      data: [{
        key: 'sk-*************************************************6dc',
        user_id: '55255',
        remark: '张三',
        created_at: '2025-07-30T07:31:10.000Z',
        used_at: '2025-07-30T07:59:28.000Z',
        expired_at: '2035-07-28T07:26:00.000Z',
        used_times: '1',
        used_fee: '90.00',
        max_fee: '250000.00',
        permissions: ['gpt-5', 'gpt-5-mini'],
        is_admin: false,
        is_disabled: false,
        is_check_permission: false,
      }],
    });

    expect(viewModel.message).toBe('Get api keys success, total keys: 1');
    expect(viewModel.items).toHaveLength(1);
    expect(viewModel.items[0]).toMatchObject({
      name: '张三',
      key: 'sk-*************************************************6dc',
      status: '可用',
      usedFee: '$0.00',
      maxFee: '$1.00',
      remainingFee: '$1.00',
      remainingPercent: '99.96%',
      usedTimes: '1',
      createdAt: '2025-07-30 15:31:10',
      usedAt: '2025-07-30 15:59:28',
      expiredAt: '2035-07-28 15:26:00',
      permissions: ['gpt-5', 'gpt-5-mini'],
    });
    expect(JSON.stringify(viewModel)).not.toContain('user_id');
    expect(JSON.stringify(viewModel)).not.toContain('is_admin');
    expect(JSON.stringify(viewModel)).not.toContain('is_check_permission');
  });

  it('renders formatted quota results instead of raw JSON', () => {
    const html = renderToStaticMarkup(
      <ModelInfoPanel
        availableModels={[]}
        pricing={[]}
        loading={false}
        onApiKeyQuery={async () => ({
          statusCode: 200,
          message: 'Get api keys success, total keys: 1',
          data: [{
            key: 'sk-*************************************************6dc',
            user_id: '55255',
            remark: '张三',
            created_at: '2025-07-30T07:31:10.000Z',
            used_at: null,
            expired_at: '2035-07-28T07:26:00.000Z',
            used_times: '1',
            used_fee: '90.00',
            max_fee: '250000.00',
            permissions: ['gpt-5'],
            is_admin: false,
            is_disabled: true,
            is_check_permission: false,
          }],
        })}
        initialQueryResult={{
          statusCode: 200,
          message: 'Get api keys success, total keys: 1',
          data: [{
            key: 'sk-*************************************************6dc',
            user_id: '55255',
            remark: '张三',
            created_at: '2025-07-30T07:31:10.000Z',
            used_at: null,
            expired_at: '2035-07-28T07:26:00.000Z',
            used_times: '1',
            used_fee: '90.00',
            max_fee: '250000.00',
            permissions: ['gpt-5'],
            is_admin: false,
            is_disabled: true,
            is_check_permission: false,
          }],
        }}
      />,
    );

    expect(html).toContain('姓名');
    expect(html).toContain('张三');
    expect(html).toContain('剩余额度比例');
    expect(html.indexOf('已用额度')).toBeLessThan(html.indexOf('总额度'));
    expect(html).toContain('可用模型');
    expect(html).toContain('gpt-5');
    expect(html).toContain('$1.00');
    expect(html).not.toContain('user_id');
    expect(html).not.toContain('{&quot;statusCode&quot;');
    expect(html).not.toContain('Get api keys success');
    expect(html).not.toContain('total keys');
  });
});
