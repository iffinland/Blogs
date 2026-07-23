import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QdnResourceError } from './qdnService';

// ── Mock setup (hoisted) ────────────────────────────────────

const { mockRequestQortium } = vi.hoisted(() => ({
  mockRequestQortium: vi.fn(),
}));

vi.mock('../qortium/qortiumClient', () => ({
  requestQortium: mockRequestQortium,
}));

import { fetchJsonResource, fetchJsonResourceWithReadiness } from './qdnService';
import { resolveBlogPost } from '../blog/blogService';

// ── Helpers ─────────────────────────────────────────────────

const validBlogPost = () => ({
  schema: 'qortium.blog.post.v1' as const,
  version: 1,
  blogId: 'b.test',
  postId: 'abc12345',
  ownerName: 'Alice',
  title: 'Test Post',
  excerpt: 'A test',
  category: 'test',
  tags: [] as string[],
  blocks: [{ id: 't1', type: 'text' as const, version: 1, content: 'hello' }],
  createdAt: 100,
  updatedAt: 200,
  status: 'published' as const,
});

const error1401 = () => new QdnResourceError(1401, 'Data unavailable.');
const errorOther = () => new QdnResourceError(9999, 'Other error.');

const makeCandidate = (name: string, updated: number) => ({
  name, identifier: 'p.b.test.abc12345', updated,
  created: updated - 100, title: '', description: '', tags: [] as string[],
});

beforeEach(() => {
  mockRequestQortium.mockReset();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Tests ───────────────────────────────────────────────────

describe('fetchJsonResource', () => {
  it('returns valid JSON payload normally', async () => {
    mockRequestQortium.mockResolvedValueOnce(validBlogPost());
    const result = await fetchJsonResource('BLOG_POST', 'Alice', 'p.b.test.abc12345');
    expect(result).toEqual(validBlogPost());
  });

  it('throws QdnResourceError on error envelope', async () => {
    mockRequestQortium.mockResolvedValueOnce({ error: 1401, message: 'Data unavailable.' });
    await expect(
      fetchJsonResource('BLOG_POST', 'Alice', 'p.b.test.abc12345'),
    ).rejects.toThrow(QdnResourceError);
  });
});

describe('fetchJsonResourceWithReadiness', () => {
  it('B1: valid FETCH succeeds immediately (zero polling)', async () => {
    mockRequestQortium.mockResolvedValueOnce(validBlogPost());
    const promise = fetchJsonResourceWithReadiness('BLOG_POST', 'Alice', 'p.b.test.abc12345');
    await vi.advanceTimersByTimeAsync(0);
    const result = await promise;
    expect(result).toEqual(validBlogPost());
    const fetchCalls = mockRequestQortium.mock.calls.filter(
      ([req]) => (req as Record<string, unknown>).action === 'FETCH_QDN_RESOURCE',
    );
    expect(fetchCalls).toHaveLength(1);
  });

  it('B2: 1401 → DOWNLOADING → READY → valid FETCH succeeds', async () => {
    let callCount = 0;
    mockRequestQortium.mockImplementation((req: Record<string, unknown>) => {
      callCount++;
      if (req.action === 'FETCH_QDN_RESOURCE' && callCount <= 1) throw error1401();
      if (req.action === 'GET_QDN_RESOURCE_STATUS' && !req.build) {
        const statusCalls = mockRequestQortium.mock.calls.filter(
          ([r]) => (r as Record<string, unknown>).action === 'GET_QDN_RESOURCE_STATUS'
            && !(r as Record<string, unknown>).build,
        );
        return Promise.resolve({ status: statusCalls.length <= 1 ? 'DOWNLOADING' : 'READY', description: '' });
      }
      if (req.action === 'GET_QDN_RESOURCE_STATUS' && req.build) {
        return Promise.resolve({ status: 'BUILD_TRIGGERED' });
      }
      if (req.action === 'FETCH_QDN_RESOURCE') return Promise.resolve(validBlogPost());
      return Promise.resolve(null);
    });

    const promise = fetchJsonResourceWithReadiness('BLOG_POST', 'Alice', 'p.b.test.abc12345');
    await vi.advanceTimersByTimeAsync(1600);
    expect(await promise).toEqual(validBlogPost());
  });

  it('B3: persistent 1401 times out within bounded budget', async () => {
    mockRequestQortium.mockImplementation((req: Record<string, unknown>) => {
      if (req.action === 'FETCH_QDN_RESOURCE') throw error1401();
      if (req.action === 'GET_QDN_RESOURCE_STATUS' && !req.build) {
        return Promise.resolve({ status: 'DOWNLOADING', description: '' });
      }
      if (req.action === 'GET_QDN_RESOURCE_STATUS' && req.build) {
        return Promise.resolve({ status: 'BUILD_TRIGGERED' });
      }
      return Promise.resolve(null);
    });

    const promise = fetchJsonResourceWithReadiness('BLOG_POST', 'Alice', 'p.b.test.abc12345', 5000);
    await vi.advanceTimersByTimeAsync(5100);
    await expect(promise).rejects.toThrow(QdnResourceError);
  });

  it('B4: non-1401 error propagates immediately, zero polling', async () => {
    mockRequestQortium.mockImplementation((req: Record<string, unknown>) => {
      if (req.action === 'FETCH_QDN_RESOURCE') throw errorOther();
      return Promise.resolve(null);
    });

    const promise = fetchJsonResourceWithReadiness('BLOG_POST', 'Alice', 'p.b.test.abc12345');
    await vi.advanceTimersByTimeAsync(0);
    await expect(promise).rejects.toThrow(errorOther());
    const statusCalls = mockRequestQortium.mock.calls.filter(
      ([req]) => (req as Record<string, unknown>).action === 'GET_QDN_RESOURCE_STATUS',
    );
    expect(statusCalls).toHaveLength(0);
  });

  it('B5: request count is bounded', async () => {
    mockRequestQortium.mockImplementation((req: Record<string, unknown>) => {
      if (req.action === 'FETCH_QDN_RESOURCE') throw error1401();
      if (req.action === 'GET_QDN_RESOURCE_STATUS' && !req.build) {
        return Promise.resolve({ status: 'DOWNLOADING', description: '' });
      }
      if (req.action === 'GET_QDN_RESOURCE_STATUS' && req.build) {
        return Promise.resolve({ status: 'BUILD_TRIGGERED' });
      }
      return Promise.resolve(null);
    });

    const promise = fetchJsonResourceWithReadiness('BLOG_POST', 'Alice', 'p.b.test.abc12345', 3000);
    await vi.advanceTimersByTimeAsync(3100);
    await expect(promise).rejects.toThrow(QdnResourceError);
    expect(mockRequestQortium.mock.calls.length).toBeLessThanOrEqual(13);
    expect(mockRequestQortium.mock.calls.length).toBeGreaterThan(1);
  });

  it('B9: NOT_PUBLISHED throws plain Error, not QdnResourceError', async () => {
    let callCount = 0;
    mockRequestQortium.mockImplementation((req: Record<string, unknown>) => {
      callCount++;
      if (req.action === 'FETCH_QDN_RESOURCE' && callCount === 1) throw error1401();
      if (req.action === 'GET_QDN_RESOURCE_STATUS' && !req.build) {
        return Promise.resolve({ status: 'NOT_PUBLISHED', description: 'Resource does not exist' });
      }
      if (req.action === 'GET_QDN_RESOURCE_STATUS' && req.build) {
        return Promise.resolve({ status: 'BUILD_TRIGGERED' });
      }
      return Promise.resolve(null);
    });

    const promise = fetchJsonResourceWithReadiness('BLOG_POST', 'Alice', 'p.b.test.abc12345');
    await vi.advanceTimersByTimeAsync(100);
    const err = (await promise.catch((e: unknown) => e)) as Error;
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(QdnResourceError);
    expect(err.message).toBe('Resource is not published.');
  });
});

describe('_ resolver — multi-candidate behavior', () => {
  it('B6: A unavailable(timeout), B truthful → returns B', async () => {
    const fetchBehavior = new Map([['Alice', 'unavailable' as const], ['Bob', 'valid' as const]]);

    mockRequestQortium.mockImplementation((req: Record<string, unknown>) => {
      if (req.action === 'SEARCH_QDN_RESOURCES') {
        return Promise.resolve([makeCandidate('Alice', 200), makeCandidate('Bob', 100)]);
      }
      if (req.action === 'FETCH_QDN_RESOURCE') {
        const name = req.name as string;
        if (fetchBehavior.get(name) === 'unavailable') throw error1401();
        return Promise.resolve({ ...validBlogPost(), ownerName: name });
      }
      if (req.action === 'GET_QDN_RESOURCE_STATUS' && !req.build) {
        return Promise.resolve({ status: 'DOWNLOADING', description: '' });
      }
      if (req.action === 'GET_QDN_RESOURCE_STATUS' && req.build) {
        return Promise.resolve({ status: 'BUILD_TRIGGERED' });
      }
      return Promise.resolve(null);
    });

    const promise = resolveBlogPost('_', 'p.b.test.abc12345');
    await vi.advanceTimersByTimeAsync(3200);
    expect((await promise).ownerName).toBe('Bob');
  });

  it('B7: A becomes available + truthful → returns A, B not used', async () => {
    let fetchAttempt = 0;
    mockRequestQortium.mockImplementation((req: Record<string, unknown>) => {
      if (req.action === 'SEARCH_QDN_RESOURCES') {
        return Promise.resolve([makeCandidate('Alice', 200), makeCandidate('Bob', 100)]);
      }
      if (req.action === 'FETCH_QDN_RESOURCE') {
        fetchAttempt++;
        const name = req.name as string;
        if (name === 'Alice' && fetchAttempt === 1) throw error1401();
        return Promise.resolve({ ...validBlogPost(), ownerName: name });
      }
      if (req.action === 'GET_QDN_RESOURCE_STATUS' && !req.build) {
        return Promise.resolve({ status: 'READY', description: '' });
      }
      if (req.action === 'GET_QDN_RESOURCE_STATUS' && req.build) {
        return Promise.resolve({ status: 'BUILD_TRIGGERED' });
      }
      return Promise.resolve(null);
    });

    const promise = resolveBlogPost('_', 'p.b.test.abc12345');
    await vi.advanceTimersByTimeAsync(1600);
    expect((await promise).ownerName).toBe('Alice');
  });

  it('B8: all candidates unavailable → throws QdnResourceError(1401)', async () => {
    mockRequestQortium.mockImplementation((req: Record<string, unknown>) => {
      if (req.action === 'SEARCH_QDN_RESOURCES') {
        return Promise.resolve([makeCandidate('Alice', 200), makeCandidate('Bob', 100)]);
      }
      if (req.action === 'FETCH_QDN_RESOURCE') throw error1401();
      if (req.action === 'GET_QDN_RESOURCE_STATUS' && !req.build) {
        return Promise.resolve({ status: 'DOWNLOADING', description: '' });
      }
      if (req.action === 'GET_QDN_RESOURCE_STATUS' && req.build) {
        return Promise.resolve({ status: 'BUILD_TRIGGERED' });
      }
      return Promise.resolve(null);
    });

    const promise = resolveBlogPost('_', 'p.b.test.abc12345');
    await vi.advanceTimersByTimeAsync(6200);
    await expect(promise).rejects.toThrow(QdnResourceError);
    await expect(promise).rejects.toHaveProperty('code', 1401);
  });
});
