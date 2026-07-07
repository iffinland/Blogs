import { describe, expect, it } from 'vitest';
import { getInitialDeepLink } from './deepLinks';

describe('deep links', () => {
  it('reads blog and post query params', () => {
    expect(getInitialDeepLink('?blog=b.ivm&post=p.b.ivm.abc123')).toEqual({
      blogId: 'b.ivm',
      postIdentifier: 'p.b.ivm.abc123',
    });
  });

  it('returns nulls when query params are absent', () => {
    expect(getInitialDeepLink('?theme=dark')).toEqual({
      blogId: null,
      postIdentifier: null,
    });
  });
});
