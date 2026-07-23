import { describe, expect, it, vi } from 'vitest';
import { buildPostLink, getInitialDeepLink } from './deepLinks';

// buildPostLink depends on window globals injected by Qortium Home.
// In the Node test environment we provide minimal stubs.
const stubWindow = () => {
  vi.stubGlobal('window', {
    ...globalThis.window,
    _qdnService: 'APP',
    _qdnName: 'Blog',
    _qdnIdentifier: 'Blog',
    location: { pathname: '/' },
  });
};

describe('deep links', () => {
  it('reads blog and post query params', () => {
    expect(getInitialDeepLink('?blog=b.ivm&post=p.b.ivm.abc123')).toEqual({
      blogId: 'b.ivm',
      postIdentifier: 'p.b.ivm.abc123',
      publisherName: null,
    });
  });

  it('reads publisher name for post deep links', () => {
    expect(getInitialDeepLink('?post=p.b.ivm.abc123&name=Alice')).toEqual({
      blogId: null,
      postIdentifier: 'p.b.ivm.abc123',
      publisherName: 'Alice',
    });
  });

  it('returns nulls when query params are absent', () => {
    expect(getInitialDeepLink('?theme=dark')).toEqual({
      blogId: null,
      postIdentifier: null,
      publisherName: null,
    });
  });

  it('builds post links with publisher name', () => {
    stubWindow();
    const link = buildPostLink('p.b.ivm.abc123', 'Alice');
    expect(link).toContain('post=p.b.ivm.abc123');
    expect(link).toContain('name=Alice');
  });

  it('builds post links without publisher name (legacy)', () => {
    stubWindow();
    const link = buildPostLink('p.b.ivm.abc123');
    expect(link).toContain('post=p.b.ivm.abc123');
    expect(link).not.toContain('name=');
  });
});
