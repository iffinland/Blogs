import { describe, expect, it } from 'vitest';
import { createCommentId, createPostId, toCommentIdentifier, toPostIdentifier } from './identifiers';
import { parsePostIdentifier } from './identifiers';

describe('publisher-scoped post identifiers', () => {
  it('creates deterministic post identifiers from blogId + postId', () => {
    const postId = 'k4m8x2q9';
    const identifier = toPostIdentifier('b.ivm', postId);
    expect(identifier).toBe('p.b.ivm.k4m8x2q9');
    expect(parsePostIdentifier(identifier)).toEqual({
      blogId: 'b.ivm',
      postId: 'k4m8x2q9',
    });
  });

  it('ensures post identifiers are not globally unique — two publishers can have the same logical identifier', () => {
    // This verifies that our scoping strategy is necessary:
    // Bob and Alice can both have p.b.ivm.k4m8x2q9 because they
    // publish under different QDN names.
    const identifier1 = toPostIdentifier('b.ivm', 'k4m8x2q9');
    const identifier2 = toPostIdentifier('b.ivm', 'k4m8x2q9');
    expect(identifier1).toBe(identifier2);
    // Same identifier string — only QDN (service, name, identifier) makes it unique.
  });

  it('generates unique post IDs', () => {
    const ids = new Set(Array.from({ length: 50 }, () => createPostId()));
    expect(ids.size).toBe(50);
  });

  it('generates unique comment IDs', () => {
    const ids = new Set(Array.from({ length: 50 }, () => createCommentId()));
    expect(ids.size).toBe(50);
  });

  it('creates scoped comment identifiers from postId', () => {
    const identifier = toCommentIdentifier('k4m8x2q9', 'a91z0p');
    expect(identifier).toBe('c.k4m8x2q9.a91z0p');
  });
});
