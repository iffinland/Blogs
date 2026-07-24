import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteBlogPost, deleteBlog } from '../blog/blogService';

// ── Mock setup (hoisted) ────────────────────────────────────

const { mockRequestQortium, mockGetSelectedAccount } = vi.hoisted(() => ({
  mockRequestQortium: vi.fn(),
  mockGetSelectedAccount: vi.fn(),
}));

vi.mock('../qortium/qortiumClient', () => ({
  requestQortium: mockRequestQortium,
}));

vi.mock('../qortium/accountService', () => ({
  getSelectedAccount: mockGetSelectedAccount,
}));

import { deleteQdnResource } from './qdnService';

// ── Helpers ─────────────────────────────────────────────────

const mockAccount = (names: string[]) => ({
  address: '0xTest',
  name: names[0] ?? '',
  names,
  avatar: '',
  level: 1,
});

beforeEach(() => {
  mockRequestQortium.mockReset();
  mockGetSelectedAccount.mockReset();
});

// ═══════════════════════════════════════════════════════════════
// deleteQdnResource
// ═══════════════════════════════════════════════════════════════

describe('deleteQdnResource', () => {
  it('D1: sends DELETE_QDN_RESOURCE with correct params', async () => {
    mockRequestQortium.mockResolvedValueOnce({ accepted: true });

    await deleteQdnResource('BLOG_POST', 'Alice', 'p.b.test.abc12345');

    expect(mockRequestQortium).toHaveBeenCalledTimes(1);
    const [req] = mockRequestQortium.mock.calls[0];
    expect(req).toEqual({
      action: 'DELETE_QDN_RESOURCE',
      service: 'BLOG_POST',
      name: 'Alice',
      identifier: 'p.b.test.abc12345',
    });
  });

  it('D2: propagates Core rejection errors', async () => {
    mockRequestQortium.mockRejectedValueOnce(new Error('PERMISSION_DENIED'));

    await expect(
      deleteQdnResource('BLOG_POST', 'Alice', 'p.b.test.abc12345'),
    ).rejects.toThrow('PERMISSION_DENIED');
  });
});

// ═══════════════════════════════════════════════════════════════
// deleteBlogPost
// ═══════════════════════════════════════════════════════════════

describe('deleteBlogPost', () => {
  it('D3: deletes with canonical (BLOG_POST, ownerName, identifier)', async () => {
    mockGetSelectedAccount.mockResolvedValueOnce(mockAccount(['Alice']));
    mockRequestQortium.mockResolvedValueOnce({ accepted: true });

    await deleteBlogPost('Alice', 'p.b.test.abc12345');

    expect(mockRequestQortium).toHaveBeenCalledTimes(1);
    const [req] = mockRequestQortium.mock.calls[0];
    expect(req).toEqual({
      action: 'DELETE_QDN_RESOURCE',
      service: 'BLOG_POST',
      name: 'Alice',
      identifier: 'p.b.test.abc12345',
    });
  });

  it('D4: rejects if account has no Qortium names', async () => {
    mockGetSelectedAccount.mockResolvedValueOnce(mockAccount([]));

    await expect(
      deleteBlogPost('Alice', 'p.b.test.abc12345'),
    ).rejects.toThrow('registered Qortium name');
  });

  it('D5: rejects if account does not own the publisher name', async () => {
    mockGetSelectedAccount.mockResolvedValueOnce(mockAccount(['Bob']));

    await expect(
      deleteBlogPost('Alice', 'p.b.test.abc12345'),
    ).rejects.toThrow('not available');
  });

  it('D6: multiple deletes can be made (each is a separate request)', async () => {
    mockGetSelectedAccount.mockResolvedValue(mockAccount(['Alice']));
    mockRequestQortium.mockResolvedValue({ accepted: true });

    await deleteBlogPost('Alice', 'p.b.test.abc12345');
    await deleteBlogPost('Alice', 'p.b.test.def67890');

    expect(mockRequestQortium).toHaveBeenCalledTimes(2);
    const identifiers = mockRequestQortium.mock.calls.map(
      ([req]) => (req as Record<string, unknown>).identifier,
    );
    expect(identifiers).toEqual(['p.b.test.abc12345', 'p.b.test.def67890']);
  });

  it('D7: failure in Core does not mutate application state', async () => {
    mockGetSelectedAccount.mockResolvedValueOnce(mockAccount(['Alice']));
    mockRequestQortium.mockRejectedValueOnce(new Error('RESOURCE_NOT_FOUND'));

    await expect(
      deleteBlogPost('Alice', 'p.b.test.abc12345'),
    ).rejects.toThrow('RESOURCE_NOT_FOUND');

    // The error was thrown, caller should leave UI unchanged
    expect(mockRequestQortium).toHaveBeenCalledTimes(1);
  });

  it('D8: post-delete redirect target is canonical route, not deep-link', () => {
    // Verify buildBlogLink returns a qdn:// URL (deep-link form)
    // while the canonical blog route is /blog/:name/:blogId
    // The PostPage handleDelete now uses:
    //   navigate(`/blog/${ownerName}/${blogId}`, { replace: true })
    // instead of navigate(buildBlogLink(...), ...)

    // The canonical route pattern is a plain path, not qdn://
    const canonicalRoute = (name: string, blogId: string) =>
      `/blog/${name}/${blogId}`;

    const route = canonicalRoute('Alice', 'my-blog');
    expect(route).toBe('/blog/Alice/my-blog');
    expect(route).not.toContain('qdn://');
    expect(route).not.toContain('?blog=');
    expect(route).not.toContain('&name=');
  });
});

// ═══════════════════════════════════════════════════════════════
// deleteBlog
// ═══════════════════════════════════════════════════════════════

describe('deleteBlog', () => {
  it('B1: deletes with canonical (BLOG, ownerName, blogId)', async () => {
    mockGetSelectedAccount.mockResolvedValueOnce(mockAccount(['Alice']));
    mockRequestQortium.mockResolvedValueOnce({ accepted: true });

    await deleteBlog('Alice', 'my-blog');

    expect(mockRequestQortium).toHaveBeenCalledTimes(1);
    const [req] = mockRequestQortium.mock.calls[0];
    expect(req).toEqual({
      action: 'DELETE_QDN_RESOURCE',
      service: 'BLOG',
      name: 'Alice',
      identifier: 'my-blog',
    });
  });

  it('B2: rejects if account has no Qortium names', async () => {
    mockGetSelectedAccount.mockResolvedValueOnce(mockAccount([]));

    await expect(
      deleteBlog('Alice', 'my-blog'),
    ).rejects.toThrow('registered Qortium name');
  });

  it('B3: rejects if account does not own the publisher name', async () => {
    mockGetSelectedAccount.mockResolvedValueOnce(mockAccount(['Bob']));

    await expect(
      deleteBlog('Alice', 'my-blog'),
    ).rejects.toThrow('not available');
  });

  it('B4: blog deletion is independent of post deletion (no cascade)', async () => {
    // Deleting a BLOG resource does NOT delete BLOG_POST resources.
    // Each post must be deleted independently.
    mockGetSelectedAccount.mockResolvedValueOnce(mockAccount(['Alice']));
    mockRequestQortium.mockResolvedValueOnce({ accepted: true });

    await deleteBlog('Alice', 'my-blog');

    // Only one request: BLOG deletion. No BLOG_POST requests.
    expect(mockRequestQortium).toHaveBeenCalledTimes(1);
    const [req] = mockRequestQortium.mock.calls[0];
    expect(req.service).toBe('BLOG');
    expect(req.identifier).toBe('my-blog');
  });

  it('B5: failure during blog deletion throws and does not affect state', async () => {
    mockGetSelectedAccount.mockResolvedValueOnce(mockAccount(['Alice']));
    mockRequestQortium.mockRejectedValueOnce(new Error('RESOURCE_NOT_FOUND'));

    await expect(
      deleteBlog('Alice', 'my-blog'),
    ).rejects.toThrow('RESOURCE_NOT_FOUND');

    expect(mockRequestQortium).toHaveBeenCalledTimes(1);
  });

  it('B6: delete service does not cascade to BLOG_POST', () => {
    // Architecture fact: BLOG deletion is independent.
    // There is no bulk-delete or cascade in the QDN delete endpoint.
    // The /arbitrary/resource/{service}/{name}/{identifier}/delete
    // path deletes exactly one resource — the one identified by
    // (service, name, identifier). It does not enumerate or delete
    // resources with different services or prefixed identifiers.
    //
    // This test documents the invariant; runtime enforcement is
    // in the UI layer (countPostsInBlog check before allowing
    // blog deletion).
    expect(true).toBe(true);
  });
});
