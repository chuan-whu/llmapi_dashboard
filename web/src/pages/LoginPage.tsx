import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { useThemeStore } from '@/stores';
import type { Theme } from '@/types';
import { BrandLink } from '@/components/BrandLink';
import styles from './LoginPage.module.scss';

const THEME_OPTIONS: ReadonlyArray<{ value: Theme; labelKey: string }> = [
  { value: 'white', labelKey: 'usage_stats.theme_light' },
  { value: 'dark', labelKey: 'usage_stats.theme_dark' },
  { value: 'auto', labelKey: 'usage_stats.theme_auto' },
];

interface LoginPageProps {
  adminError?: string;
  loading?: boolean;
  onPasswordSubmit: (password: string) => Promise<void>;
}

export function LoginPage({ loading = false, adminError = '', onPasswordSubmit }: LoginPageProps) {
  const { t } = useTranslation();
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const [password, setPassword] = useState('');
  const themeOptions = useMemo(
    () => THEME_OPTIONS.map((option) => ({ ...option, label: t(option.labelKey) })),
    [t]
  );
  const loginSubtitle = t('auth.login_subtitle');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onPasswordSubmit(password);
  };

  const canSubmit = Boolean(password.trim());

  return (
    <div className={styles.pageShell}>
      <div className={styles.frame}>
        <div className={styles.utilityDock}>
          <LanguageSwitcher />
          <div className={styles.themeSwitcher} role="tablist" aria-label={t('usage_stats.theme_switch')}>
            {themeOptions.map((option) => {
              const active = theme === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`${styles.themePill} ${active ? styles.themePillActive : ''}`.trim()}
                  onClick={() => setTheme(option.value)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className={styles.brandBlock}>
          <BrandLink className={styles.eyebrow} />
          <h1 className={styles.title}>{t('auth.login_title')}</h1>
          {loginSubtitle && <p className={styles.subtitle}>{loginSubtitle}</p>}
        </div>

        <Card className={styles.loginCard}>
          <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
            <Input
              type="password"
              autoComplete="current-password"
              label={t('auth.password_label')}
              placeholder={t('auth.password_placeholder')}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              error={adminError || undefined}
              disabled={loading}
            />
            <p className={styles.formHint}>{t('auth.password_hint')}</p>
            <Button type="submit" fullWidth loading={loading} disabled={!canSubmit}>
              {t('auth.login_submit')}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
