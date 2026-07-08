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
