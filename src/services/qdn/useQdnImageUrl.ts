import { useState, useEffect, useRef, useCallback } from 'react';
import { getQdnResourceUrl, getResourceStatus } from './qdnService';
import { requestQortium } from '../qortium/qortiumClient';
import type { QdnResourceRef } from '../../types/blog';

const MAX_RETRY_CHECKS = 2;
const RETRY_DELAY_MS = 2_000;

/**
 * Hook: resolve a QDN image URL with automatic recovery when the
 * browser fails to decode the image.
 *
 * Recovery strategy:
 *  1. onError → GET_QDN_RESOURCE_STATUS
 *  2. READY        → cache-bust reload (incrementing query param)
 *  3. PUBLISHED /
 *     DOWNLOADING   → request build=true, then re-check up to
 *                     MAX_RETRY_CHECKS times (RETRY_DELAY_MS apart)
 *  4. NOT_PUBLISHED → immediate fallback
 *
 * Bounded: at most MAX_RETRY_CHECKS+1 URL fetches + up to
 * MAX_RETRY_CHECKS status polls per failed decode.  When refData
 * changes the old cycle is abandoned.
 */
export function useQdnImageUrl(
  refData: QdnResourceRef,
  fallbackSrc?: string,
): {
  url: string;
  handleError: () => void;
} {
  const [url, setUrl] = useState('');
  const [errorCount, setErrorCount] = useState(0);

  // Track whether the current ref is still active (abort cycles on unmount / ref change)
  const activeRef = useRef(true);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCheckCountRef = useRef(0);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  // Resolve the base URL on mount / ref change
  useEffect(() => {
    activeRef.current = true;
    retryCheckCountRef.current = 0;
    clearRetryTimer();
    setErrorCount(0);

    let ignore = false;
    void getQdnResourceUrl(refData)
      .then((resourceUrl) => {
        if (ignore || !activeRef.current) return;
        setUrl(resourceUrl);
      })
      .catch(() => {
        if (ignore || !activeRef.current) return;
        setUrl(fallbackSrc ?? '');
      });
    return () => {
      ignore = true;
      activeRef.current = false;
      clearRetryTimer();
    };
  }, [refData, fallbackSrc, clearRetryTimer]);

  // Cache-bust helper: strips existing cb= and increments (or starts at 1)
  const bustCache = useCallback((baseUrl: string): string => {
    const match = baseUrl.match(/[?&]cb=(\d+)/);
    const next = match ? parseInt(match[1], 10) + 1 : 1;
    const stripped = baseUrl.replace(/[?&]cb=\d+/g, '');
    const sep = stripped.includes('?') ? '&' : '?';
    return stripped + `${sep}cb=${next}`;
  }, []);

  const handleError = useCallback(() => {
    if (!activeRef.current || !url) return;

    const attempt = errorCount + 1;
    if (attempt > MAX_RETRY_CHECKS + 1) {
      // Exhausted all retries — permanent fallback
      if (fallbackSrc !== undefined && url !== fallbackSrc) {
        setUrl(fallbackSrc);
      }
      return;
    }

    // Increment error count to track attempts
    setErrorCount(attempt);

    void (async () => {
      try {
        const status = await getResourceStatus(
          refData.service,
          refData.name,
          refData.identifier,
        );

        if (!activeRef.current) return;

        if (status.status === 'READY') {
          // Data is fully available — cache-bust reload
          setUrl(bustCache(url));
          return;
        }

        if (status.status === 'NOT_PUBLISHED') {
          // Will never be available
          if (fallbackSrc !== undefined && url !== fallbackSrc) {
            setUrl(fallbackSrc);
          }
          return;
        }

        // PUBLISHED / DOWNLOADING — poll with build=true
        retryCheckCountRef.current = 0;

        const pollForReady = async () => {
          if (!activeRef.current) return;

          if (retryCheckCountRef.current >= MAX_RETRY_CHECKS) {
            // Exhausted re-checks — fallback
            if (fallbackSrc !== undefined && url !== fallbackSrc) {
              setUrl(fallbackSrc);
            }
            return;
          }

          const pollStatus = await getResourceStatus(
            refData.service,
            refData.name,
            refData.identifier,
          );

          if (!activeRef.current) return;

          retryCheckCountRef.current += 1;

          if (pollStatus.status === 'READY') {
            setUrl(bustCache(url));
            return;
          }

          if (pollStatus.status === 'NOT_PUBLISHED') {
            if (fallbackSrc !== undefined && url !== fallbackSrc) {
              setUrl(fallbackSrc);
            }
            return;
          }

          // Still PUBLISHED/DOWNLOADING — schedule another re-check if budget remains
          if (retryCheckCountRef.current < MAX_RETRY_CHECKS) {
            retryTimerRef.current = setTimeout(pollForReady, RETRY_DELAY_MS);
          } else {
            // Exhausted after this status check
            if (fallbackSrc !== undefined && url !== fallbackSrc) {
              setUrl(fallbackSrc);
            }
          }
        };

        // Request build immediately
        requestQortium<unknown>({
          action: 'GET_QDN_RESOURCE_STATUS',
          service: refData.service,
          name: refData.name,
          identifier: refData.identifier,
          build: true,
        }).catch(() => undefined);

        retryTimerRef.current = setTimeout(pollForReady, RETRY_DELAY_MS);
      } catch {
        // Status check failed — try fallback
        if (activeRef.current && fallbackSrc !== undefined && url !== fallbackSrc) {
          setUrl(fallbackSrc);
        }
      }
    })();
  }, [url, errorCount, refData, fallbackSrc, bustCache]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      activeRef.current = false;
      clearRetryTimer();
    };
  }, [clearRetryTimer]);

  return { url, handleError };
}
