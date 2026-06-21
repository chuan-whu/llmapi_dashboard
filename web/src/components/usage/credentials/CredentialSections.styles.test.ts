import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const credentialStyles = readFileSync(new URL('./CredentialSections.module.scss', import.meta.url), 'utf8')
const credentialShellSource = readFileSync(new URL('./CredentialSectionShell.tsx', import.meta.url), 'utf8')
const aiProviderSectionSource = readFileSync(new URL('./AiProviderCredentialsSection.tsx', import.meta.url), 'utf8')

describe('Credential section styles', () => {
  it('keeps AI Provider row sizing stable across breakpoints', () => {
    expect(credentialStyles).toMatch(/\.aiProviderCredentialRow\s*\{[\s\S]*?grid-template-columns:\s*300px minmax\(394px, max-content\) minmax\(250px, 1fr\);/)
    expect(credentialStyles).toMatch(/\.aiProviderCredentialRow\s*\{[\s\S]*?\.credentialIdentityBlock\s*\{[\s\S]*?max-width:\s*300px;/)
    expect(credentialStyles).toMatch(/\.aiProviderCredentialRow\s*\{[\s\S]*?@include tablet\s*\{[\s\S]*?grid-template-columns:\s*1fr;/)
    expect(credentialStyles).toMatch(/\.aiProviderCredentialRow\s*\{[\s\S]*?@include mobile\s*\{[\s\S]*?grid-template-columns:\s*1fr;/)
    expect(credentialShellSource).toContain('rowClassName?: string')
    expect(aiProviderSectionSource).toContain('rowClassName={styles.aiProviderCredentialRow}')
    expect(credentialStyles).not.toContain('authFileCredentialRow')
    expect(credentialStyles).not.toContain('credentialQuota')
  })

  it('keeps Total Requests fixed and wraps the breakdown only when it overflows', () => {
    expect(credentialStyles).toMatch(/\.credentialMetricGroup\s*\{[\s\S]*?grid-template-columns:\s*109px repeat\(3, 95px\);/)
    expect(credentialStyles).toMatch(/\.credentialRequestMetric\s*\{[\s\S]*?align-items:\s*baseline;/)
    expect(credentialStyles).toMatch(/\.credentialRequestMetric\s*\{[\s\S]*?flex-wrap:\s*wrap;/)
    expect(credentialStyles).toMatch(/\.credentialRequestMetric\s*\{[\s\S]*?white-space:\s*normal;/)
    expect(credentialStyles).toMatch(/\.credentialRequestBreakdown\s*\{[\s\S]*?display:\s*inline-flex;/)
    expect(credentialStyles).toMatch(/\.credentialRequestBreakdown\s*\{[\s\S]*?white-space:\s*nowrap;/)
    expect(credentialStyles).not.toMatch(/\.credentialRequestBreakdown\s*\{[\s\S]*?flex-basis:\s*100%;/)
    expect(credentialStyles).toMatch(/\.credentialRequestBreakdown\s*\{[\s\S]*?line-height:\s*1\.2;/)
  })

  it('uses a fixed centered pagination bar height', () => {
    expect(credentialStyles).toMatch(/\.credentialPagination\s*\{[\s\S]*?--usage-pagination-bar-height:\s*51px;/)
    expect(credentialStyles).toMatch(/\.credentialPagination\s*\{[\s\S]*?height:\s*var\(--usage-pagination-bar-height\);/)
    expect(credentialStyles).toMatch(/\.credentialPagination\s*\{[\s\S]*?box-sizing:\s*border-box;/)
    expect(credentialStyles).toMatch(/\.credentialPagination\s*\{[\s\S]*?align-items:\s*center;/)
    expect(credentialStyles).toMatch(/\.credentialPagination\s*\{[\s\S]*?padding:\s*0 22px;/)
    expect(credentialStyles).toMatch(/@include mobile\s*\{[\s\S]*?\.credentialPagination\s*\{[\s\S]*?overflow-x:\s*auto;/)
    expect(credentialStyles).toMatch(/@include mobile\s*\{[\s\S]*?\.credentialPaginationControls\s*\{[\s\S]*?width:\s*max-content;/)
    expect(credentialStyles).toMatch(/@include mobile\s*\{[\s\S]*?\.credentialPageSizeControl\s*\{[\s\S]*?flex:\s*0 0 auto;/)
  })
})
