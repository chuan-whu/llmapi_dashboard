import { useEffect, useState } from 'react';
import { fetchStatus } from '@/lib/api';
import { GITHUB_REPOSITORY_URL } from '@/utils/constants';

export function footerVersionLabel(version?: string): string | undefined {
  const trimmed = version?.trim();
  return trimmed ? `Version: ${trimmed}` : undefined;
}

export function AppFooter({ version: fixedVersion }: { version?: string }) {
  const [version, setVersion] = useState('');

  useEffect(() => {
    if (fixedVersion !== undefined) return;

    let cancelled = false;
    void fetchStatus()
      .then((status) => {
        if (!cancelled) setVersion(status.version ?? '');
      })
      .catch(() => {
        if (!cancelled) setVersion('');
      });

    return () => {
      cancelled = true;
    };
  }, [fixedVersion]);

  const versionLabel = footerVersionLabel(fixedVersion ?? version);

  return (
    <footer className="app-footer">
      <div className="app-footer-line app-footer-meta">
        <span>© 2026</span>
        <a href={GITHUB_REPOSITORY_URL} target="_blank" rel="noreferrer">llmapi_dashboard</a>
        <span>·</span>
        <a href={`${GITHUB_REPOSITORY_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer">License</a>
        {versionLabel ? (
          <>
            <span>·</span>
            <span className="app-footer-version">{versionLabel}</span>
          </>
        ) : null}
      </div>
    </footer>
  );
}
