import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import type { CpaApiKeySettingsItem } from '@/lib/types';
import { safeApiKeyDisplayLabel } from '@/utils/sensitiveDisplay';
import styles from '@/pages/UsagePage.module.scss';

interface ApiKeySettingsTitleProps {
  title: string;
  subtitle: string;
  eyebrow: string;
}

function ApiKeySettingsTitle({ title, subtitle, eyebrow }: ApiKeySettingsTitleProps) {
  return (
    <div className={styles.sectionTitleBlock}>
      <span className={styles.sectionEyebrow}>{eyebrow}</span>
      <h3 className={styles.sectionTitle}>{title}</h3>
      <p className={styles.sectionSubtitle}>{subtitle}</p>
    </div>
  );
}

export interface ApiKeySettingsCardProps {
  apiKeys: CpaApiKeySettingsItem[];
  loading?: boolean;
  savingId?: string | null;
  onSaveAlias?: (id: string, keyAlias: string) => void | Promise<void>;
}

export function ApiKeySettingsCard({ apiKeys, loading = false }: ApiKeySettingsCardProps) {
  const { t } = useTranslation();

  return (
    <Card
      title={
        <ApiKeySettingsTitle
          eyebrow={t('usage_stats.api_key_settings_eyebrow')}
          title={t('usage_stats.api_key_settings_title')}
          subtitle={t('usage_stats.api_key_settings_subtitle')}
        />
      }
      className={`${styles.detailsFixedCard} ${styles.apiKeySettingsCard}`}
    >
      <div className={styles.apiKeySettingsBody}>
        {loading && apiKeys.length === 0 ? (
          <div className={styles.hint}>{t('common.loading')}</div>
        ) : apiKeys.length === 0 ? (
          <div className={styles.hint}>{t('usage_stats.api_key_settings_empty')}</div>
        ) : (
          <div className={styles.apiKeySettingsList}>
            {apiKeys.map((item) => (
              <div key={item.id} className={styles.apiKeySettingsItem}>
                <div className={styles.apiKeySettingsSummary}>
                  <span className={styles.apiKeyFieldLabel}>{t('usage_stats.api_key_settings_display_key')}</span>
                  <span className={styles.apiKeySettingsName}>{safeApiKeyDisplayLabel(item.displayKey)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
