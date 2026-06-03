import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { IconSearch } from '@/components/ui/icons';
import type { ModelInfoQueryResponse, OhMyGPTAPIKeyToken, PricingEntry } from '@/lib/types';
import styles from '@/pages/UsagePage.module.scss';
import { maskSensitiveText } from '@/utils/sensitiveDisplay';

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
  onApiKeyQuery: (apiKey: string, signal?: AbortSignal) => Promise<ModelInfoQueryResponse>;
  initialQueryResult?: ModelInfoQueryResponse | null;
}

interface OhMyGPTQuotaCardViewModel {
  name: string;
  key: string;
  status: string;
  usedFee: string;
  maxFee: string;
  remainingFee: string;
  remainingPercent: string;
  usedTimes: string;
  createdAt: string;
  usedAt: string;
  expiredAt: string;
  permissions: string[];
}

interface OhMyGPTQuotaViewModel {
  statusCode?: number;
  message: string;
  items: OhMyGPTQuotaCardViewModel[];
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

const OHMYGPT_FEE_UNIT = 250000;

const toFiniteNumber = (value: unknown): number => {
  const numeric = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  return Number.isFinite(numeric) ? numeric : 0;
};

const formatDollarFee = (rawValue: unknown): string => `$${(toFiniteNumber(rawValue) / OHMYGPT_FEE_UNIT).toFixed(2)}`;

const formatRemainingPercent = (usedFee: unknown, maxFee: unknown): string => {
  const used = toFiniteNumber(usedFee);
  const max = toFiniteNumber(maxFee);
  if (max <= 0) return '0.00%';
  const remaining = Math.max(0, max - used);
  return `${((remaining / max) * 100).toFixed(2)}%`;
};

const formatRemainingFee = (usedFee: unknown, maxFee: unknown): string => (
  `$${(Math.max(0, toFiniteNumber(maxFee) - toFiniteNumber(usedFee)) / OHMYGPT_FEE_UNIT).toFixed(2)}`
);

const formatBeijingTime = (value: unknown): string => {
  if (typeof value !== 'string' || value.trim() === '') return '未使用';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const partMap = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${partMap.year}-${partMap.month}-${partMap.day} ${partMap.hour}:${partMap.minute}:${partMap.second}`;
};

const normalizedPermissions = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return normalizeModels(value.filter((item): item is string => typeof item === 'string'));
};

const presentOhMyGPTToken = (token: OhMyGPTAPIKeyToken, index: number): OhMyGPTQuotaCardViewModel => ({
  name: typeof token.remark === 'string' && token.remark.trim() ? token.remark.trim() : `用户 ${index + 1}`,
  key: typeof token.key === 'string' && token.key.trim() ? maskSensitiveText(token.key.trim()) : '-',
  status: token.is_disabled ? '已禁用' : '可用',
  usedFee: formatDollarFee(token.used_fee),
  maxFee: formatDollarFee(token.max_fee),
  remainingFee: formatRemainingFee(token.used_fee, token.max_fee),
  remainingPercent: formatRemainingPercent(token.used_fee, token.max_fee),
  usedTimes: String(token.used_times ?? '0'),
  createdAt: formatBeijingTime(token.created_at),
  usedAt: formatBeijingTime(token.used_at),
  expiredAt: formatBeijingTime(token.expired_at),
  permissions: normalizedPermissions(token.permissions),
});

export function presentOhMyGPTQueryResponse(result: ModelInfoQueryResponse): OhMyGPTQuotaViewModel {
  const data = Array.isArray(result?.data) ? result.data : [];
  return {
    statusCode: typeof result?.statusCode === 'number' ? result.statusCode : undefined,
    message: typeof result?.message === 'string' ? result.message : '',
    items: data.map(presentOhMyGPTToken),
  };
}

const isFormattedOhMyGPTResponse = (result: ModelInfoQueryResponse | null): result is ModelInfoQueryResponse => (
  !!result && Array.isArray(result.data)
);

function ModelInfoTitle({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <div className={styles.sectionTitleBlock}>
      <span className={styles.sectionEyebrow}>{eyebrow}</span>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {subtitle && <p className={styles.sectionSubtitle}>{subtitle}</p>}
    </div>
  );
}

export function ModelInfoPanel({ availableModels, pricing, loading, onApiKeyQuery, initialQueryResult = null }: ModelInfoPanelProps) {
  const { t } = useTranslation();
  const [apiKey, setApiKey] = useState('');
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState('');
  const [queryResult, setQueryResult] = useState<ModelInfoQueryResponse | null>(initialQueryResult);
  const queryAbortRef = useRef<AbortController | null>(null);
  const models = useMemo(() => normalizeModels(availableModels), [availableModels]);
  const rows = useMemo(() => mergeModelPricingRows(availableModels, pricing), [availableModels, pricing]);
  const trimmedAPIKey = apiKey.trim();

  useEffect(() => () => {
    queryAbortRef.current?.abort();
  }, []);

  const handleQuerySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmedAPIKey || queryLoading) return;

    queryAbortRef.current?.abort();
    const controller = new AbortController();
    queryAbortRef.current = controller;
    setQueryLoading(true);
    setQueryError('');
    setQueryResult(null);

    try {
      const result = await onApiKeyQuery(trimmedAPIKey, controller.signal);
      if (controller.signal.aborted) return;
      setQueryResult(result);
    } catch (error) {
      if (controller.signal.aborted) return;
      setQueryError(error instanceof Error ? error.message : t('usage_stats.model_info_query_failed'));
    } finally {
      if (queryAbortRef.current === controller) {
        queryAbortRef.current = null;
      }
      if (!controller.signal.aborted) {
        setQueryLoading(false);
      }
    }
  };

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

      <Card
        className={`${styles.modelInfoCard} ${styles.modelInfoQueryCard}`}
        title={(
          <ModelInfoTitle
            eyebrow={t('usage_stats.model_info_query_eyebrow')}
            title={t('usage_stats.model_info_query_title')}
            subtitle={t('usage_stats.model_info_query_subtitle')}
          />
        )}
      >
        <form className={styles.modelInfoQueryForm} onSubmit={handleQuerySubmit}>
          <div className={styles.modelInfoQueryField}>
            <Input
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              label={t('usage_stats.model_info_query_input_label')}
              placeholder={t('usage_stats.model_info_query_input_placeholder')}
              className={styles.modelInfoQueryInput}
            />
          </div>
          <Button type="submit" className={styles.modelInfoQueryButton} disabled={!trimmedAPIKey} loading={queryLoading}>
            <IconSearch size={16} />
            {t('usage_stats.model_info_query_button')}
          </Button>
        </form>

        {queryError && <div className={styles.modelInfoQueryError}>{queryError}</div>}
        {queryResult !== null && (
          isFormattedOhMyGPTResponse(queryResult)
            ? <OhMyGPTQueryResults result={queryResult} />
            : <pre className={styles.modelInfoQueryResult}>{maskSensitiveText(JSON.stringify(queryResult, null, 2) ?? String(queryResult))}</pre>
        )}
      </Card>
    </div>
  );
}

function OhMyGPTQueryResults({ result }: { result: ModelInfoQueryResponse }) {
  const viewModel = presentOhMyGPTQueryResponse(result);
  return (
    <div className={styles.ohMyGPTResultPanel}>
      {typeof viewModel.statusCode === 'number' && (
        <div className={styles.ohMyGPTResultSummary}>
          <span>状态码 {viewModel.statusCode}</span>
        </div>
      )}
      {viewModel.items.length === 0 ? (
        <EmptyState title="未找到匹配 Key" description="请确认输入的 API Key 与 Oh My GPT 返回列表一致。" />
      ) : (
        <div className={styles.ohMyGPTQuotaList}>
          {viewModel.items.map((item) => (
            <article key={`${item.key}-${item.name}`} className={styles.ohMyGPTQuotaCard}>
              <div className={styles.ohMyGPTQuotaHeader}>
                <div>
                  <div className={styles.ohMyGPTQuotaName}>{item.name}</div>
                  <div className={styles.ohMyGPTQuotaKey}>{item.key}</div>
                </div>
                <span className={`${styles.ohMyGPTStatusBadge} ${item.status === '已禁用' ? styles.ohMyGPTStatusDisabled : ''}`}>
                  {item.status}
                </span>
              </div>
              <div className={styles.ohMyGPTQuotaMetrics}>
                <Metric label="剩余额度" value={item.remainingFee} strong />
                <Metric label="剩余额度比例" value={item.remainingPercent} strong />
                <Metric label="已用额度" value={item.usedFee} />
                <Metric label="总额度" value={item.maxFee} />
                <Metric label="调用次数" value={item.usedTimes} />
              </div>
              <div className={styles.ohMyGPTQuotaDetails}>
                <Field label="姓名" value={item.name} />
                <Field label="Key" value={item.key} />
                <Field label="创建时间" value={item.createdAt} />
                <Field label="最后使用" value={item.usedAt} />
                <Field label="过期时间" value={item.expiredAt} />
              </div>
              <div className={styles.ohMyGPTPermissionsBlock}>
                <div className={styles.ohMyGPTPermissionsTitle}>可用模型</div>
                {item.permissions.length === 0 ? (
                  <div className={styles.hint}>暂无可用模型</div>
                ) : (
                  <div className={styles.modelInfoList}>
                    {item.permissions.map((permission) => (
                      <span key={permission} className={styles.modelInfoChip}>{permission}</span>
                    ))}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? styles.ohMyGPTMetricStrong : styles.ohMyGPTMetric}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.ohMyGPTField}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
