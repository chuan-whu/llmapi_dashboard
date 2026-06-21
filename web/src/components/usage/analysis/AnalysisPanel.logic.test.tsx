import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ChartData, ChartOptions } from 'chart.js';
import type { AnalysisResponse } from '@/lib/types';

const chartCapture = vi.hoisted(() => ({
  barData: null as ChartData<'bar', number[], string> | null,
  barOptions: null as ChartOptions<'bar'> | null,
  doughnutData: [] as Array<ChartData<'doughnut', number[], string>>,
}));

vi.mock('react-chartjs-2', () => ({
  Bar: (props: { data: ChartData<'bar', number[], string>; options: ChartOptions<'bar'> }) => {
    chartCapture.barData = props.data;
    chartCapture.barOptions = props.options;
    return React.createElement('div');
  },
  Doughnut: (props: { data: ChartData<'doughnut', number[], string> }) => {
    chartCapture.doughnutData.push(props.data);
    return React.createElement('div');
  },
}));

vi.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: () => {},
  },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import { AnalysisPanel } from './AnalysisPanel';

const emptyAnalysis: AnalysisResponse = {
  granularity: 'hourly',
  timezone: 'UTC',
  token_usage: [],
  api_key_composition: [],
  api_key_cost_composition: [],
  model_composition: [],
  auth_files_composition: [],
  ai_provider_composition: [],
  heatmap: {
    api_keys: [],
    models: [],
    cells: [],
  },
};

describe('AnalysisPanel token chart data', () => {
  it('subtracts cached and reasoning tokens from displayed token series while keeping total tooltip values', () => {
    const analysis: AnalysisResponse = {
      ...emptyAnalysis,
      token_usage: [{
        bucket: '2026-05-28T01:00:00Z',
        input_tokens: 1000,
        output_tokens: 100,
        cached_tokens: 600,
        reasoning_tokens: 50,
        total_tokens: 1150,
        requests: 3,
      }],
    };

    renderToStaticMarkup(<AnalysisPanel analysis={analysis} loading={false} isDark={false} isMobile={false} />);

    const datasets = chartCapture.barData?.datasets ?? [];
    expect(datasets.find((dataset) => dataset.label === 'usage_stats.input_tokens')?.data).toEqual([400]);
    expect(datasets.find((dataset) => dataset.label === 'usage_stats.cached_tokens')?.data).toEqual([600]);
    expect(datasets.find((dataset) => dataset.label === 'usage_stats.output_tokens')?.data).toEqual([50]);
    expect(datasets.find((dataset) => dataset.label === 'usage_stats.reasoning_tokens')?.data).toEqual([50]);
    const tooltipLabel = chartCapture.barOptions?.plugins?.tooltip?.callbacks?.label;
    expect(typeof tooltipLabel).toBe('function');
    expect(tooltipLabel?.({
      dataset: { label: 'usage_stats.input_tokens', tooltipData: [1000] },
      dataIndex: 0,
      parsed: { y: 400 },
    } as never)).toBe('usage_stats.input_tokens: 1.00K');
    expect(tooltipLabel?.({
      dataset: { label: 'usage_stats.output_tokens', tooltipData: [100] },
      dataIndex: 0,
      parsed: { y: 50 },
    } as never)).toBe('usage_stats.output_tokens: 100');
    expect(tooltipLabel?.({
      dataset: null,
      dataIndex: 0,
      parsed: { y: 125 },
    } as never)).toBe('125');
    const tooltipFooter = chartCapture.barOptions?.plugins?.tooltip?.callbacks?.footer;
    expect(typeof tooltipFooter).toBe('function');
    expect(tooltipFooter?.([{ dataIndex: 0 }] as never)).toBe('usage_stats.total_tokens: 1.15K');
  });
});

describe('AnalysisPanel composition chart data', () => {
  it('uses API Key cost composition for the third composition chart', () => {
    chartCapture.doughnutData = [];
    const analysis: AnalysisResponse = {
      ...emptyAnalysis,
      api_key_composition: [{
        key: 'api-key-token',
        label: 'token share key',
        total_tokens: 1000,
        requests: 2,
        percent: 100,
      }],
      api_key_cost_composition: [{
        key: 'api-key-cost',
        label: 'sk-c*****************5678',
        total_tokens: 0,
        requests: 2,
        cost: 12.5,
        cost_percent: 100,
        percent: 100,
      }],
      model_composition: [{
        key: 'model-a',
        label: 'model-a',
        total_tokens: 1000,
        requests: 2,
        percent: 100,
      }],
      ai_provider_composition: [{
        key: 'provider-a',
        label: 'AI account 1',
        total_tokens: 1000,
        requests: 2,
        percent: 100,
      }],
    };

    const html = renderToStaticMarkup(<AnalysisPanel analysis={analysis} loading={false} isDark={false} isMobile={false} />);

    expect(html).toContain('usage_stats.analysis_api_key_cost_composition_title');
    expect(html).not.toContain('usage_stats.analysis_auth_files_composition_title');
    expect(chartCapture.doughnutData[2]?.labels).toEqual(['sk-c*****************5678']);
    expect(chartCapture.doughnutData[2]?.datasets[0]?.data).toEqual([12.5]);
    expect(html).toContain('AI account 1');
    expect(html).not.toContain('codex account 1');
    expect(html).not.toContain('openai account 1');
  });

  it('does not expose API key aliases, raw API keys, or real AI provider labels', () => {
    chartCapture.doughnutData = [];
    const analysis: AnalysisResponse = {
      ...emptyAnalysis,
      api_key_composition: [{
        key: 'sk-live-secret-value-1234567890',
        label: 'Production Alias',
        total_tokens: 1000,
        requests: 2,
        percent: 100,
      }],
      api_key_cost_composition: [{
        key: 'sk-live-secret-value-1234567890',
        label: 'Cost Alias',
        total_tokens: 0,
        requests: 2,
        cost: 12.5,
        cost_percent: 100,
        percent: 100,
      }],
      model_composition: [{
        key: 'model-a',
        label: 'model-a',
        total_tokens: 1000,
        requests: 2,
        percent: 100,
      }],
      ai_provider_composition: [{
        key: 'provider-a',
        label: 'OpenAI Primary',
        total_tokens: 1000,
        requests: 2,
        percent: 100,
      }],
      heatmap: {
        api_keys: ['sk-fake-key-123456'],
        models: ['model-a'],
        cells: [{
          api_key: 'sk-fake-key-123456',
          model: 'model-a',
          total_tokens: 1000,
          requests: 2,
          intensity: 1,
        }],
      },
    };

    const html = renderToStaticMarkup(<AnalysisPanel analysis={analysis} loading={false} isDark={false} isMobile={false} />);

    expect(html).toMatch(/sk-f\*+3456/);
    expect(html).toContain('AI account 1');
    expect(html).not.toContain('sk-live-secret-value-1234567890');
    expect(html).not.toContain('Production Alias');
    expect(html).not.toContain('Cost Alias');
    expect(html).not.toContain('OpenAI Primary');
    expect(chartCapture.doughnutData[0]?.labels?.[0]).toMatch(/^sk-l\*+7890$/);
    expect(chartCapture.doughnutData[2]?.labels?.[0]).toMatch(/^sk-l\*+7890$/);
    expect(chartCapture.doughnutData[3]?.labels).toEqual(['AI account 1']);
  });
});
