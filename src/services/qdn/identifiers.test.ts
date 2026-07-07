import { describe, expect, it } from 'vitest';
import {
  parseCommentIdentifier,
  parsePostIdentifier,
  sanitizeIdentifierSegment,
  toBlogId,
  toCommentIdentifier,
  toPostIdentifier,
} from './identifiers';

describe('QDN identifier helpers', () => {
  it('creates short blog ids from user handles', () => {
    expect(toBlogId('My Qortium Blog!')).toBe('b.my-qortium-blog');
  });

  it('keeps blog handles compact', () => {
    expect(toBlogId('a very long blog handle that should be cut')).toBe('b.a-very-long-blog-h');
  });

  it('creates parseable post identifiers', () => {
    const identifier = toPostIdentifier('b.ivm', 'k4m8x2q9');
    expect(identifier).toBe('p.b.ivm.k4m8x2q9');
    expect(parsePostIdentifier(identifier)).toEqual({
      blogId: 'b.ivm',
      postId: 'k4m8x2q9',
    });
  });

  it('creates parseable comment identifiers', () => {
    const identifier = toCommentIdentifier('k4m8x2q9', 'a91z0p');
    expect(identifier).toBe('c.k4m8x2q9.a91z0p');
    expect(parseCommentIdentifier(identifier)).toEqual({
      postId: 'k4m8x2q9',
      commentId: 'a91z0p',
    });
  });

  it('sanitizes unsupported characters', () => {
    expect(sanitizeIdentifierSegment('Äge Blogi: QDN & Qortium')).toBe('age-blogi-qdn-qortium');
  });

  it('rejects empty blog ids', () => {
    expect(() => toBlogId('!!!')).toThrow('Blog handle is required.');
  });
});
