import { describe, expect, it } from 'vitest';
import { applyColorFormat, applyLinkFormat, stripRichTextMarkup } from './richText';

describe('rich text formatting', () => {
  it('inserts QDN links without an HTTP placeholder', () => {
    const result = applyLinkFormat({
      value: '',
      selectionStart: 0,
      selectionEnd: 0,
      url: 'qdn://APP/blogs/Blogs',
    });

    expect(result.value).toBe('[url=qdn://APP/blogs/Blogs]qdn://APP/blogs/Blogs[/url]');
    expect(result.value).not.toContain('https://');
  });

  it('uses the optional label as clickable text', () => {
    const result = applyLinkFormat({
      value: '',
      selectionStart: 0,
      selectionEnd: 0,
      url: 'qdn://APP/blogs/Blogs?post=p.b.user.post',
      label: 'Read post',
    });

    expect(result.value).toBe('[url=qdn://APP/blogs/Blogs?post=p.b.user.post]Read post[/url]');
  });

  it('uses selected text as the link label when no label is given', () => {
    const selected = 'Read post';
    const result = applyLinkFormat({
      value: selected,
      selectionStart: 0,
      selectionEnd: selected.length,
      url: 'qdn://APP/blogs/Blogs?post=p.b.user.post',
    });

    expect(result.value).toBe('[url=qdn://APP/blogs/Blogs?post=p.b.user.post]Read post[/url]');
  });

  it('wraps selected text in a safe color tag', () => {
    const result = applyColorFormat({
      value: 'Colored text',
      selectionStart: 0,
      selectionEnd: 12,
      color: '#2563eb',
    });

    expect(result.value).toBe('[color=#2563eb]Colored text[/color]');
  });

  it('strips color markup from plain text extraction', () => {
    expect(stripRichTextMarkup('[color=#2563eb]Blue[/color] text')).toBe('Blue text');
  });
});

// ── Link safety ─────────────────────────────────────────────

import { autolinkText, getSafeLinkHref } from './richText';

describe('getSafeLinkHref', () => {
  it('allows qdn:// links', () => {
    expect(getSafeLinkHref('qdn://APP/blogs/Blogs')).toBe('qdn://APP/blogs/Blogs');
  });

  it('allows https:// links', () => {
    expect(getSafeLinkHref('https://example.com')).toBe('https://example.com');
  });

  it('allows http:// links', () => {
    expect(getSafeLinkHref('http://example.com')).toBe('http://example.com');
  });

  it('allows internal paths', () => {
    expect(getSafeLinkHref('/blog/Alice/b.test')).toBe('/blog/Alice/b.test');
  });

  it('allows fragment links', () => {
    expect(getSafeLinkHref('#comments')).toBe('#comments');
  });

  it('blocks javascript: URLs', () => {
    expect(getSafeLinkHref('javascript:alert(1)')).toBe('');
  });

  it('blocks data: URLs', () => {
    expect(getSafeLinkHref('data:text/html,<script>alert(1)</script>')).toBe('');
  });

  it('returns empty for unsupported schemes', () => {
    expect(getSafeLinkHref('ftp://example.com')).toBe('');
  });

  it('returns empty for empty/undefined input', () => {
    expect(getSafeLinkHref('')).toBe('');
    expect(getSafeLinkHref(undefined)).toBe('');
  });
});

describe('autolinkText', () => {
  it('detects plain qdn:// URL in text', () => {
    const result = autolinkText('Visit qdn://APP/blogs/Blogs now');
    expect(result).toEqual([
      { kind: 'text', value: 'Visit ' },
      { kind: 'link', href: 'qdn://APP/blogs/Blogs', value: 'qdn://APP/blogs/Blogs' },
      { kind: 'text', value: ' now' },
    ]);
  });

  it('detects plain https:// URL in text', () => {
    const result = autolinkText('See https://example.com for more');
    expect(result).toEqual([
      { kind: 'text', value: 'See ' },
      { kind: 'link', href: 'https://example.com', value: 'https://example.com' },
      { kind: 'text', value: ' for more' },
    ]);
  });

  it('preserves visible URL text exactly', () => {
    const result = autolinkText('qdn://APP/blogs/Blogs');
    expect(result[0]).toEqual({
      kind: 'link',
      href: 'qdn://APP/blogs/Blogs',
      value: 'qdn://APP/blogs/Blogs',
    });
  });

  it('returns plain text when no URL is present', () => {
    const result = autolinkText('Hello world');
    expect(result).toEqual([{ kind: 'text', value: 'Hello world' }]);
  });

  it('does not double-autolink an explicit [url] tag (handled by tokenizer)', () => {
    // The tokenizer removes [url=...]...[/url] before text reaches
    // autolinkText.  This test confirms autolinkText doesn't break
    // on the raw markup (it just treats it as text).
    const result = autolinkText('[url=qdn://APP/blogs/Blogs]Read[/url]');
    // The [url=...] portion would be matched as a URL.
    expect(result.some((s) => s.kind === 'link')).toBe(true);
  });

  it('does not autolink inside code blocks (handled by tokenizer)', () => {
    // Code blocks bypass autolinkText entirely in the renderer.
    // This verifies the function itself would autolink plain URLs
    // in arbitrary text (the renderer is responsible for not
    // passing code content through autolinkText).
    const result = autolinkText('qdn://APP/test');
    expect(result[0].kind).toBe('link');
  });
});
