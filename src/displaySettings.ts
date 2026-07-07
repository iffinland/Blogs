import {
  getDefaultLanguage,
  isRtlLanguage,
  normalizeLanguage,
  type SupportedLanguage,
} from './i18n';

export type ThemeMode = 'light' | 'dark';

export type DisplaySettings = {
  language: SupportedLanguage;
  theme: ThemeMode;
};

const THEME_STORAGE_KEY = 'qortium-blog-theme';

const isThemeMode = (value: unknown): value is ThemeMode => value === 'light' || value === 'dark';

const getQuery = () => {
  if (typeof window === 'undefined') return new URLSearchParams();
  return new URLSearchParams(window.location.search);
};

export const getInitialDisplaySettings = (): DisplaySettings => {
  const query = getQuery();
  const queryTheme = query.get('theme') ?? query.get('qdnTheme');
  const language =
    normalizeLanguage(query.get('lang') ?? query.get('language')) ??
    normalizeLanguage(typeof window === 'undefined' ? undefined : window._qdnLang) ??
    normalizeLanguage(typeof window === 'undefined' ? undefined : window._qdnLanguage) ??
    getDefaultLanguage();

  return {
    language,
    theme: isThemeMode(queryTheme) ? queryTheme : 'light',
  };
};

export const applyDisplaySettings = (settings: DisplaySettings) => {
  document.documentElement.dataset.theme = settings.theme;
  document.documentElement.dataset.language = settings.language;
  document.documentElement.lang = settings.language;
  document.documentElement.dir = isRtlLanguage(settings.language) ? 'rtl' : 'ltr';
  document.documentElement.style.colorScheme = settings.theme;
};

export const persistTheme = (theme: ThemeMode) => {
  localStorage.setItem(THEME_STORAGE_KEY, theme);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const getDisplaySettingsUpdateFromMessage = (
  value: unknown,
  current: DisplaySettings,
): DisplaySettings | null => {
  if (!isRecord(value)) return null;

  const action = typeof value.action === 'string' ? value.action : '';

  if (action === 'THEME_CHANGED') {
    return null;
  }

  if (action === 'LANGUAGE_CHANGED') {
    const language = normalizeLanguage(value.language ?? value.lang ?? value.qdnLang);
    return language ? { ...current, language } : null;
  }

  if (action === 'DISPLAY_SETTINGS_CHANGED' || action === 'QDN_DISPLAY_SETTINGS_CHANGED') {
    const language =
      normalizeLanguage(value.language ?? value.lang ?? value.qdnLang) ?? current.language;
    return { ...current, language };
  }

  return null;
};
