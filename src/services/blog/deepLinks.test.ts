import { describe, expect, it, vi } from 'vitest';
import { buildBlogLink, buildPostLink, getInitialDeepLink } from './deepLinks';

// buildBlogLink/buildPostLink depend on window globals injected by Qortium Home.
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

  it('reads publisher name for blog deep links', () => {
    expect(getInitialDeepLink('?blog=b.ivm&name=Alice')).toEqual({
      blogId: 'b.ivm',
      postIdentifier: null,
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

  it('builds blog links with publisher name', () => {
    stubWindow();
    const link = buildBlogLink('b.ivm', 'Alice');
    expect(link).toContain('blog=b.ivm');
    expect(link).toContain('name=Alice');
  });

  it('builds blog links without publisher name (legacy)', () => {
    stubWindow();
    const link = buildBlogLink('b.ivm');
    expect(link).toContain('blog=b.ivm');
    expect(link).not.toContain('name=');
  });

  it('two publisher-aware blog links for same blogId differ by publisher', () => {
    stubWindow();
    const linkAlice = buildBlogLink('b.my-blog', 'Alice');
    const linkBob = buildBlogLink('b.my-blog', 'Bob');
    expect(linkAlice).toContain('name=Alice');
    expect(linkBob).toContain('name=Bob');
    expect(linkAlice).not.toBe(linkBob);
  });

  it('publisher-aware blog link resolves deterministically for Publisher A', () => {
    const parsed = getInitialDeepLink('?blog=b.my-blog&name=Alice');
    expect(parsed.blogId).toBe('b.my-blog');
    expect(parsed.publisherName).toBe('Alice');
  });

  it('publisher-aware blog link does not resolve to Publisher B', () => {
    const parsed = getInitialDeepLink('?blog=b.my-blog&name=Alice');
    expect(parsed.publisherName).not.toBe('Bob');
  });

  it('legacy identifier-only blog link has null publisherName', () => {
    const parsed = getInitialDeepLink('?blog=b.my-blog');
    expect(parsed.blogId).toBe('b.my-blog');
    expect(parsed.publisherName).toBeNull();
  });
});
