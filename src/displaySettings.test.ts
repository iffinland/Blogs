import { describe, expect, it } from 'vitest';
import { getDisplaySettingsUpdateFromMessage, type DisplaySettings } from './displaySettings';

const current: DisplaySettings = {
  language: 'en',
  theme: 'light',
};

describe('display settings', () => {
  it('ignores theme from Home messages', () => {
    expect(
      getDisplaySettingsUpdateFromMessage({ action: 'THEME_CHANGED', theme: 'dark' }, current),
    ).toBeNull();
  });

  it('updates language from Home messages', () => {
    expect(
      getDisplaySettingsUpdateFromMessage(
        { action: 'LANGUAGE_CHANGED', qdnLang: 'et-EE' },
        current,
      ),
    ).toEqual({
      language: 'et',
      theme: 'light',
    });
  });

  it('ignores unsupported messages', () => {
    expect(getDisplaySettingsUpdateFromMessage({ action: 'UNKNOWN' }, current)).toBeNull();
  });
});
