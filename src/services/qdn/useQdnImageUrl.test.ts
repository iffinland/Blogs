/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useQdnImageUrl } from './useQdnImageUrl';
import type { QdnResourceRef } from '../../types/blog';

// ── Mock setup (hoisted) ────────────────────────────────────

const { mockRequestQortium } = vi.hoisted(() => ({
  mockRequestQortium: vi.fn(),
}));

vi.mock('../qortium/qortiumClient', () => ({
  requestQortium: mockRequestQortium,
}));

// ── Helpers ─────────────────────────────────────────────────

const imageRef: QdnResourceRef = {
  service: 'IMAGE',
  name: 'Alice',
  identifier: 'i.test.cover',
};

const imageUrl = 'https://qdn.local/arbitrary/IMAGE/Alice/i.test.cover';
const fallbackUrl = '/fallback.svg';

beforeEach(() => {
  mockRequestQortium.mockReset();
  vi.useRealTimers(); // default: real timers; individual tests opt into fake
});

// ── Real-timer resolve helper ───────────────────────────────

const resolveInitialUrl = async () => {
  mockRequestQortium.mockResolvedValueOnce(imageUrl);
  const { result } = renderHook(() => useQdnImageUrl(imageRef, fallbackUrl));
  await waitFor(() => {
    expect(result.current.url).toBe(imageUrl);
  });
  return result;
};

// ═══════════════════════════════════════════════════════════════
// Initial resolve
// ═══════════════════════════════════════════════════════════════

describe('useQdnImageUrl — initial resolve', () => {
  it('I1: resolves URL on mount', async () => {
    mockRequestQortium.mockResolvedValueOnce(imageUrl);
    const { result } = renderHook(() => useQdnImageUrl(imageRef, fallbackUrl));
    await waitFor(() => {
      expect(result.current.url).toBe(imageUrl);
    });
  });

  it('I2: falls back when initial URL resolve fails', async () => {
    mockRequestQortium.mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useQdnImageUrl(imageRef, fallbackUrl));
    await waitFor(() => {
      expect(result.current.url).toBe(fallbackUrl);
    });
  });

  it('I3: empty string when no fallback and resolve fails', async () => {
    mockRequestQortium.mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useQdnImageUrl(imageRef));
    await waitFor(() => {
      expect(result.current.url).toBe('');
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// onError recovery
// ═══════════════════════════════════════════════════════════════

describe('useQdnImageUrl — onError recovery', () => {
  it('R1: READY → cache-bust reload', async () => {
    const result = await resolveInitialUrl();

    mockRequestQortium.mockResolvedValueOnce({ status: 'READY', description: '' });

    await act(async () => {
      result.current.handleError();
    });

    await waitFor(() => {
      expect(result.current.url).toBe(`${imageUrl}?cb=1`);
    });
  });

  it('R2: NOT_PUBLISHED → immediate fallback', async () => {
    const result = await resolveInitialUrl();

    mockRequestQortium.mockResolvedValueOnce({ status: 'NOT_PUBLISHED', description: '' });

    await act(async () => {
      result.current.handleError();
    });

    await waitFor(() => {
      expect(result.current.url).toBe(fallbackUrl);
    });
  });

  it('R3: PUBLISHED → build=true → poll READY → cache-bust', async () => {
    const result = await resolveInitialUrl();

    // Switch to fake timers for polling phase
    vi.useFakeTimers({ shouldAdvanceTime: true });

    let statusCalls = 0;
    mockRequestQortium.mockImplementation((req: Record<string, unknown>) => {
      if (req.action === 'GET_QDN_RESOURCE_STATUS') {
        // Don't count build=true calls — they're fire-and-forget
        if (req.build) return Promise.resolve({ status: 'BUILDING' });
        statusCalls++;
        return Promise.resolve({ status: statusCalls <= 2 ? 'PUBLISHED' : 'READY' });
      }
      return Promise.resolve(null);
    });

    await act(async () => {
      result.current.handleError();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.url).toBe(imageUrl); // initial check → PUBLISHED

    // Poll 1: PUBLISHED → schedule next
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.url).toBe(imageUrl);

    // Poll 2: READY → cache-bust
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.url).toMatch(/\?cb=\d+$/);
  });

  it('R4: DOWNLOADING → polls exhausted → fallback', async () => {
    const result = await resolveInitialUrl();

    vi.useFakeTimers({ shouldAdvanceTime: true });

    mockRequestQortium.mockImplementation((req: Record<string, unknown>) => {
      if (req.action === 'GET_QDN_RESOURCE_STATUS') {
        if (req.build) return Promise.resolve({ status: 'BUILDING' });
        return Promise.resolve({ status: 'DOWNLOADING' });
      }
      return Promise.resolve(null);
    });

    await act(async () => {
      result.current.handleError();
      await vi.advanceTimersByTimeAsync(0);
    });

    // Poll 1: DOWNLOADING → schedule next
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.url).toBe(imageUrl);

    // Poll 2: exhausted → fallback
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.url).toBe(fallbackUrl);
  });

  it('R5: status check fails → fallback', async () => {
    const result = await resolveInitialUrl();

    mockRequestQortium.mockRejectedValueOnce(new Error('status check failed'));

    await act(async () => {
      result.current.handleError();
    });

    await waitFor(() => {
      expect(result.current.url).toBe(fallbackUrl);
    });
  });

  it('R6: no fallback → keeps stale URL after NOT_PUBLISHED', async () => {
    mockRequestQortium.mockResolvedValueOnce(imageUrl);
    const { result } = renderHook(() => useQdnImageUrl(imageRef)); // no fallback
    await waitFor(() => {
      expect(result.current.url).toBe(imageUrl);
    });

    mockRequestQortium.mockResolvedValueOnce({ status: 'NOT_PUBLISHED' });

    await act(async () => {
      result.current.handleError();
    });

    await waitFor(() => {
      expect(result.current.url).toBe(imageUrl); // unchanged
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// Lifecycle
// ═══════════════════════════════════════════════════════════════

describe('useQdnImageUrl — lifecycle', () => {
  it('L1: ref change aborts old recovery cycle', async () => {
    // Resolve initial ref with real timers
    mockRequestQortium.mockResolvedValueOnce(imageUrl);
    const { result, rerender } = renderHook<
      ReturnType<typeof useQdnImageUrl>,
      { ref: QdnResourceRef }
    >(({ ref }) => useQdnImageUrl(ref, fallbackUrl), {
      initialProps: { ref: imageRef },
    });
    await waitFor(() => {
      expect(result.current.url).toBe(imageUrl);
    });

    // Switch to fake timers for the polling phase
    vi.useFakeTimers({ shouldAdvanceTime: true });

    // Start recovery on old ref
    mockRequestQortium.mockResolvedValueOnce({ status: 'DOWNLOADING' });
    await act(async () => {
      result.current.handleError();
      await vi.advanceTimersByTimeAsync(0);
    });

    // Change ref — switch back to real timers for the URL resolve
    vi.useRealTimers();
    const newRef: QdnResourceRef = { service: 'IMAGE', name: 'Bob', identifier: 'i.bob.avatar' };
    const newUrl = 'https://qdn.local/arbitrary/IMAGE/Bob/i.bob.avatar';
    mockRequestQortium.mockResolvedValueOnce(newUrl);

    rerender({ ref: newRef });
    await waitFor(() => {
      expect(result.current.url).toBe(newUrl);
    });

    // Old poll timer should have been cleaned up — URL stays as new
    expect(result.current.url).toBe(newUrl);
  });

  it('L2: unmount aborts recovery (no crash)', async () => {
    mockRequestQortium.mockResolvedValueOnce(imageUrl);
    const { result, unmount } = renderHook(() => useQdnImageUrl(imageRef, fallbackUrl));
    await waitFor(() => {
      expect(result.current.url).toBe(imageUrl);
    });

    vi.useFakeTimers({ shouldAdvanceTime: true });

    // Start recovery
    mockRequestQortium.mockResolvedValueOnce({ status: 'DOWNLOADING' });
    await act(async () => {
      result.current.handleError();
      await vi.advanceTimersByTimeAsync(0);
    });

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    // No assertion — verifying no crash on unmounted setState
  });
});

// ═══════════════════════════════════════════════════════════════
// Cache-busting
// ═══════════════════════════════════════════════════════════════

describe('useQdnImageUrl — cache-busting', () => {
  it('C1: appends ?cb=n for URLs without query string', async () => {
    const result = await resolveInitialUrl();

    mockRequestQortium.mockResolvedValueOnce({ status: 'READY' });
    await act(async () => {
      result.current.handleError();
    });

    await waitFor(() => {
      expect(result.current.url).toBe(`${imageUrl}?cb=1`);
    });
  });

  it('C2: appends &cb=n for URLs with existing query string', async () => {
    const urlWithQuery = `${imageUrl}?foo=bar`;
    mockRequestQortium.mockResolvedValueOnce(urlWithQuery);
    const { result } = renderHook(() => useQdnImageUrl(imageRef, fallbackUrl));
    await waitFor(() => {
      expect(result.current.url).toBe(urlWithQuery);
    });

    mockRequestQortium.mockResolvedValueOnce({ status: 'READY' });
    await act(async () => {
      result.current.handleError();
    });

    await waitFor(() => {
      expect(result.current.url).toBe(`${urlWithQuery}&cb=1`);
    });
  });

  it('C3: strips previous cb= before appending new one', async () => {
    const urlWithCb = `${imageUrl}?cb=1`;
    mockRequestQortium.mockResolvedValueOnce(urlWithCb);
    const { result } = renderHook(() => useQdnImageUrl(imageRef, fallbackUrl));
    await waitFor(() => {
      expect(result.current.url).toBe(urlWithCb);
    });

    mockRequestQortium.mockResolvedValueOnce({ status: 'READY' });
    await act(async () => {
      result.current.handleError();
    });

    // Old cb=1 is stripped; new cb=2 appended (incremented from existing)
    await waitFor(() => {
      expect(result.current.url).toBe(`${imageUrl}?cb=2`);
    });
  });
});

