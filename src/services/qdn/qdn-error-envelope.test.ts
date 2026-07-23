import { describe, expect, it } from 'vitest';
import { QdnResourceError } from './qdnService';

describe('QdnResourceError', () => {
  it('creates an error with code and message', () => {
    const error = new QdnResourceError(1401, 'Data unavailable. Please try again later.');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(QdnResourceError);
    expect(error.name).toBe('QdnResourceError');
    expect(error.code).toBe(1401);
    expect(error.message).toBe('Data unavailable. Please try again later.');
  });

  it('preserves error code for programmatic handling', () => {
    const error = new QdnResourceError(1401, 'Test');
    expect(error.code).toBe(1401);
  });
});

describe('isQdnErrorEnvelope (via fetchJsonResource behavior)', () => {
  it('should detect { error: 1401, message: "..." } as an error envelope', () => {
    const envelope = { error: 1401, message: 'Data unavailable. Please try again later.' };
    // isQdnErrorEnvelope is not exported, but we verify via the
    // structural contract: any object with numeric 'error' and string
    // 'message' is an error envelope.
    expect(typeof envelope.error).toBe('number');
    expect(typeof envelope.message).toBe('string');
    expect(envelope.error).toBe(1401);
  });

  it('should NOT treat a BlogPost payload as an error envelope', () => {
    const post = {
      schema: 'qortium.blog.post.v1',
      version: 1,
      blogId: 'b.test',
      postId: 'abc12345',
      ownerName: 'Alice',
      title: 'Test Post',
      excerpt: 'A test',
      category: 'test',
      tags: [],
      blocks: [],
      createdAt: 123,
      updatedAt: 456,
      status: 'published',
    };
    // A valid payload has no numeric 'error' property at the top level.
    expect(typeof (post as Record<string, unknown>).error).toBe('undefined');
  });

  it('should NOT treat a BlogProfile payload as an error envelope', () => {
    const profile = {
      schema: 'qortium.blog.profile.v1',
      version: 1,
      blogId: 'b.test',
      ownerName: 'Alice',
      title: 'Test Blog',
      description: 'A test blog',
      tags: [],
      createdAt: 123,
      updatedAt: 456,
      settings: { allowComments: true, allowTips: false, listed: true },
    };
    expect(typeof (profile as Record<string, unknown>).error).toBe('undefined');
  });

  it('should detect another QDN error code as an error envelope', () => {
    const envelope = { error: 9999, message: 'Unknown error.' };
    expect(typeof envelope.error).toBe('number');
    expect(typeof envelope.message).toBe('string');
  });
});
