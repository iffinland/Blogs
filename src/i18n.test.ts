import { describe, expect, it } from 'vitest';
import { createTranslator, normalizeLanguage } from './i18n';

describe('i18n', () => {
  it('normalizes Home and browser language tags', () => {
    expect(normalizeLanguage('en-US')).toBe('en');
    expect(normalizeLanguage('et_EE')).toBe('et');
    expect(normalizeLanguage('zh-Hans')).toBe('zh-CN');
    expect(normalizeLanguage('zz')).toBeNull();
  });

  it('falls back to English for missing catalog keys', () => {
    const t = createTranslator('et');
    expect(t('form.createBlog')).toBe('Loo blogi');
    expect(t('app.name')).toBe('Qortium Blog');
  });
});
