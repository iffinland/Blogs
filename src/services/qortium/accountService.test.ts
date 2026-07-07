import { describe, expect, it } from 'vitest';
import { normalizeAccountNames } from './accountService';

describe('account service', () => {
  it('normalizes names from selected account payloads', () => {
    expect(
      normalizeAccountNames({
        name: 'Primary',
        account: {
          names: [{ name: 'Second' }, { name: 'Third' }],
        },
      }),
    ).toEqual(['Primary', 'Second', 'Third']);
  });

  it('normalizes names from GET_ACCOUNT_NAMES array payloads', () => {
    expect(normalizeAccountNames([{ name: 'First' }, { name: 'Second' }, 'Third'])).toEqual([
      'First',
      'Second',
      'Third',
    ]);
  });
});
