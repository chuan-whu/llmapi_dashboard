import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import './index.css';
import './App.css';
import { ApiError, getSession, login } from './lib/api';
import { AppFooter } from './components/AppFooter';
import { LoginPage } from './pages/LoginPage';
import { UsagePage } from './pages/UsagePage';
import { useUsageStatsStore } from './stores/useUsageStatsStore';

type AuthState = 'checking' | 'authenticated' | 'unauthenticated';

function App() {
  const { t } = useTranslation();
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [adminLoginError, setAdminLoginError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const clearUsageStats = useUsageStatsStore((state) => state.clearUsageStats);

  const clearSession = useCallback(() => {
    clearUsageStats();
    setAuthState('unauthenticated');
  }, [clearUsageStats]);

  const loadSession = useCallback(async () => {
    const session = await getSession();
    if (!session.authenticated) {
      clearSession();
      return session;
    }
    setAuthState('authenticated');
    return session;
  }, [clearSession]);

  useEffect(() => {
    void loadSession().catch(() => {
      clearSession();
    });
  }, [clearSession, loadSession]);

  const handlePasswordLogin = useCallback(async (password: string) => {
    setSubmitting(true);
    setAdminLoginError('');
    try {
      await login(password);
      const session = await loadSession();
      if (!session.authenticated) {
        setAdminLoginError(t('auth.login_failed'));
        clearSession();
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setAdminLoginError(t('auth.invalid_password'));
      } else if (error instanceof ApiError && error.status === 429) {
        setAdminLoginError(t('auth.login_rate_limited'));
      } else {
        setAdminLoginError(t('auth.login_failed'));
      }
      clearSession();
    } finally {
      setSubmitting(false);
    }
  }, [clearSession, loadSession, t]);

  let page: ReactNode;
  if (authState === 'checking') {
    page = <div className="app-checking" aria-busy="true" />;
  } else if (authState === 'unauthenticated') {
    page = (
      <LoginPage
        loading={submitting}
        adminError={adminLoginError}
        onPasswordSubmit={handlePasswordLogin}
      />
    );
  } else {
    page = <UsagePage onAuthRequired={clearSession} />;
  }

  return (
    <div className="app-frame">
      <main className="app-main">{page}</main>
      <AppFooter />
    </div>
  );
}

export default App;
