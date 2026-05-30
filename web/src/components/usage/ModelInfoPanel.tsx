import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import type { PricingEntry } from '@/lib/types';
import styles from '@/pages/UsagePage.module.scss';

export interface ModelPricingRow {
  model: string;
  prompt: number;
  completion: number;
  cache: number;
}

export interface ModelInfoPanelProps {
  availableModels: string[];
  pricing: PricingEntry[];
  loading: boolean;
}

const normalizeModels = (values: string[]): string[] => {
  const seen = new Set<string>();
  const models: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    models.push(trimmed);
  }
  return models.sort((left, right) => left.localeCompare(right));
};

export function mergeModelPricingRows(availableModels: string[], pricing: PricingEntry[]): ModelPricingRow[] {
  const priceByModel = new Map(pricing.map((entry) => [entry.model, entry]));
  const modelSet = new Set(normalizeModels(availableModels));
  for (const entry of pricing) {
    if (entry.model.trim()) {
      modelSet.add(entry.model.trim());
    }
  }
  return [...modelSet].sort((left, right) => left.localeCompare(right)).map((model) => {
    const price = priceByModel.get(model);
    return {
      model,
      prompt: price?.prompt_price_per_1m ?? 0,
      completion: price?.completion_price_per_1m ?? 0,
      cache: price?.cache_price_per_1m ?? 0,
    };
  });
}

const formatPrice = (value: number): string => `$${Number.isFinite(value) ? Number(value).toString() : '0'}`;

function ModelInfoTitle({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <div className={styles.sectionTitleBlock}>
      <span className={styles.sectionEyebrow}>{eyebrow}</span>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {subtitle && <p className={styles.sectionSubtitle}>{subtitle}</p>}
    </div>
  );
}

export function ModelInfoPanel({ availableModels, pricing, loading }: ModelInfoPanelProps) {
  const { t } = useTranslation();
  const models = useMemo(() => normalizeModels(availableModels), [availableModels]);
  const rows = useMemo(() => mergeModelPricingRows(availableModels, pricing), [availableModels, pricing]);

  return (
    <div className={styles.modelInfoGrid}>
      <Card
        className={styles.modelInfoCard}
        title={(
          <ModelInfoTitle
            eyebrow={t('usage_stats.model_info_available_eyebrow')}
            title={t('usage_stats.model_info_available_title')}
            subtitle={t('usage_stats.model_info_available_subtitle')}
          />
        )}
      >
        {loading && models.length === 0 ? (
          <div className={styles.hint}>{t('common.loading')}</div>
        ) : models.length === 0 ? (
          <EmptyState title={t('usage_stats.model_info_available_empty_title')} description={t('usage_stats.model_info_available_empty_desc')} />
        ) : (
          <div className={styles.modelInfoList}>
            {models.map((model) => (
              <span key={model} className={styles.modelInfoChip}>{model}</span>
            ))}
          </div>
        )}
      </Card>

      <Card
        className={styles.modelInfoCard}
        title={(
          <ModelInfoTitle
            eyebrow={t('usage_stats.model_info_pricing_eyebrow')}
            title={t('usage_stats.model_info_pricing_title')}
            subtitle={t('usage_stats.model_info_pricing_subtitle')}
          />
        )}
      >
        {loading && rows.length === 0 ? (
          <div className={styles.hint}>{t('common.loading')}</div>
        ) : rows.length === 0 ? (
          <EmptyState title={t('usage_stats.model_info_pricing_empty_title')} description={t('usage_stats.model_info_pricing_empty_desc')} />
        ) : (
          <div className={styles.modelInfoTableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('usage_stats.model_name')}</th>
                  <th>{t('usage_stats.model_price_prompt')} ($)</th>
                  <th>{t('usage_stats.model_price_completion')} ($)</th>
                  <th>{t('usage_stats.model_price_cache')} ($)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.model}>
                    <td className={styles.modelCell}>{row.model}</td>
                    <td>{formatPrice(row.prompt)}</td>
                    <td>{formatPrice(row.completion)}</td>
                    <td>{formatPrice(row.cache)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
