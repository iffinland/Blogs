import type { BlogListItem, QdnResourceRef, QdnService } from '../../types/blog';
import { requestQortium } from '../qortium/qortiumClient';
import { encodeJsonToBase64, fileToBase64, parseJsonLike } from './encoding';

export type QdnResourceStatus = {
  status?: string;
  description?: string;
  localChunkCount?: number;
  totalChunkCount?: number;
  percentLoaded?: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isQdnErrorEnvelope = (
  value: unknown,
): value is { error: number; message: string } =>
  isRecord(value) &&
  typeof value.error === 'number' &&
  typeof value.message === 'string';

export class QdnResourceError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = 'QdnResourceError';
    this.code = code;
  }
}

type PublishJsonParams = {
  service: QdnService;
  name: string;
  identifier: string;
  payload: unknown;
  verify?: (value: unknown) => boolean;
  title?: string;
  description?: string;
  tags?: string[];
  filename?: string;
};

export type QdnResourceToPublish =
  | {
      service: QdnService;
      name: string;
      identifier: string;
      title?: string;
      description?: string;
      tags?: string[];
      filename?: string;
      data64: string;
      disableEncrypt?: boolean;
    }
  | {
      service: QdnService;
      name: string;
      identifier: string;
      title?: string;
      description?: string;
      tags?: string[];
      filename?: string;
      file: File;
      disableEncrypt?: boolean;
    };

const sleep = async (durationMs: number) => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs);
  });
};

const normalizeStatus = (value: unknown): QdnResourceStatus => {
  if (typeof value === 'string') return { status: value.toUpperCase(), description: value };
  if (!value || typeof value !== 'object') return { status: 'UNKNOWN' };
  const record = value as Record<string, unknown>;
  return {
    status: typeof record.status === 'string' ? record.status.toUpperCase() : 'UNKNOWN',
    description: typeof record.description === 'string' ? record.description : undefined,
    localChunkCount:
      typeof record.localChunkCount === 'number' ? record.localChunkCount : undefined,
    totalChunkCount:
      typeof record.totalChunkCount === 'number' ? record.totalChunkCount : undefined,
    percentLoaded: typeof record.percentLoaded === 'number' ? record.percentLoaded : undefined,
  };
};

export const searchResources = async (params: {
  service: QdnService;
  identifier?: string;
  name?: string;
  names?: string[];
  query?: string;
  prefix?: boolean;
  exactMatchNames?: boolean;
  limit?: number;
  offset?: number;
  includeMetadata?: boolean;
}) => {
  const response = await requestQortium<unknown>({
    action: 'SEARCH_QDN_RESOURCES',
    mode: 'ALL',
    reverse: true,
    excludeBlocked: true,
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
    includeMetadata: params.includeMetadata ?? true,
    ...params,
  });

  return Array.isArray(response) ? (response as BlogListItem[]) : [];
};

export const fetchJsonResource = async <T>(
  service: QdnService,
  name: string,
  identifier: string,
) => {
  const raw = await requestQortium<unknown>({
    action: 'FETCH_QDN_RESOURCE',
    service,
    name,
    identifier,
  });

  if (isQdnErrorEnvelope(raw)) {
    throw new QdnResourceError(raw.error, raw.message);
  }

  return parseJsonLike<T>(raw);
};

/**
 * Fetch a JSON QDN resource with readiness polling for temporary
 * unavailability (error 1401).  Only error 1401 triggers polling;
 * every other error is propagated immediately.
 *
 * Intended for critical authoritative read paths (blog profile, post
 * page) where the user is waiting for a single known resource.  Do NOT
 * use for list cards, post rows, bulk fetches, or search — those paths
 * should degrade gracefully with metadata.
 */
export const fetchJsonResourceWithReadiness = async <T>(
  service: QdnService,
  name: string,
  identifier: string,
  timeoutMs = 15_000,
): Promise<T> => {
  // Attempt 1: normal fetch
  try {
    return await fetchJsonResource<T>(service, name, identifier);
  } catch (error) {
    if (!(error instanceof QdnResourceError) || error.code !== 1401) {
      throw error;
    }
    // 1401 — temporary unavailability, poll until ready
  }

  const startedAt = Date.now();
  let buildRequested = false;

  while (Date.now() - startedAt < timeoutMs) {
    const status = await getResourceStatus(service, name, identifier);

    if (!buildRequested) {
      // Request the Core to download missing chunks on the first poll.
      // Fire-and-forget — we don't need the response.
      requestQortium<unknown>({
        action: 'GET_QDN_RESOURCE_STATUS',
        service,
        name,
        identifier,
        build: true,
      }).catch(() => undefined);
      buildRequested = true;
    }

    if (status.status === 'READY') {
      return fetchJsonResource<T>(service, name, identifier);
    }

    if (status.status === 'NOT_PUBLISHED') {
      throw new Error('Resource is not published.');
    }

    await sleep(1500);
  }

  throw new QdnResourceError(
    1401,
    'Resource data is temporarily unavailable. Please try again.',
  );
};

export const getResourceStatus = async (service: QdnService, name: string, identifier: string) => {
  const status = await requestQortium<unknown>({
    action: 'GET_QDN_RESOURCE_STATUS',
    service,
    name,
    identifier,
  });
  return normalizeStatus(status);
};

export const getQdnResourceUrl = async (ref: QdnResourceRef) => {
  const value = await requestQortium<unknown>({
    action: 'GET_QDN_RESOURCE_URL',
    service: ref.service,
    name: ref.name,
    identifier: ref.identifier,
    filename: ref.filename,
  });
  return typeof value === 'string' ? value : '';
};

export const waitForResourceReady = async (
  service: QdnService,
  name: string,
  identifier: string,
  timeoutMs = 45_000,
) => {
  const startedAt = Date.now();
  let latest: QdnResourceStatus = { status: 'UNKNOWN' };
  let buildRequested = false;

  while (Date.now() - startedAt < timeoutMs) {
    latest = normalizeStatus(
      await requestQortium<unknown>({
        action: 'GET_QDN_RESOURCE_STATUS',
        service,
        name,
        identifier,
        ...(buildRequested ? {} : { build: true }),
      }),
    );
    buildRequested = true;
    if (latest.status === 'READY' || latest.status === 'NOT_PUBLISHED') return latest;
    await sleep(1500);
  }

  return latest;
};

export const verifyJsonResource = async <T>(
  service: QdnService,
  name: string,
  identifier: string,
  verify?: (value: unknown) => boolean,
  retries = 5,
) => {
  let latestError: unknown = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const value = await fetchJsonResource<T>(service, name, identifier);
      if (!verify || verify(value)) return value;
      latestError = new Error('Published resource did not match the expected schema.');
    } catch (error) {
      latestError = error;
    }

    if (attempt < retries) await sleep(1200 * attempt);
  }

  throw latestError instanceof Error
    ? latestError
    : new Error('Published resource could not be verified.');
};

const parseMultiResourcePublishError = (response: unknown): string | null => {
  if (!Array.isArray(response)) return null;
  const failedIndex = response.findIndex((item) => {
    if (item === null || item === undefined) return true;
    if (typeof item === 'string') {
      const trimmed = item.trim().toLowerCase();
      return !trimmed || trimmed === 'false' || trimmed.startsWith('error');
    }
    if (typeof item !== 'object') return false;
    const record = item as Record<string, unknown>;
    return record.error === true || record.success === false;
  });
  if (failedIndex === -1) return null;
  const failed = response[failedIndex];
  const message =
    typeof failed === 'object' && failed !== null
      ? ((failed as Record<string, unknown>).message ?? (failed as Record<string, unknown>).error)
      : failed;
  return typeof message === 'string' && message.trim()
    ? `Qortium resource publish failed at item ${failedIndex + 1}: ${message}`
    : `Qortium resource publish failed at item ${failedIndex + 1}.`;
};

export const createJsonResourceToPublish = ({
  service,
  name,
  identifier,
  payload,
  title,
  description,
  tags,
  filename = 'data.json',
}: Omit<PublishJsonParams, 'verify'>): QdnResourceToPublish => ({
  service,
  name,
  identifier,
  data64: encodeJsonToBase64(payload),
  filename,
  title,
  description,
  tags: tags?.slice(0, 5),
});

const normalizeResourceForPublish = async (
  resource: QdnResourceToPublish,
): Promise<QdnResourceToPublish> => {
  if ('data64' in resource && resource.data64) return resource;
  if ('file' in resource && resource.file) {
    const { file, ...rest } = resource as { file: File } & QdnResourceToPublish;
    return { ...rest, data64: await fileToBase64(file) };
  }
  return resource;
};

export const publishMultipleQdnResources = async (resources: QdnResourceToPublish[]) => {
  if (resources.length === 0) return [];
  const normalized = await Promise.all(resources.map(normalizeResourceForPublish));
  const response = await requestQortium<unknown>({
    action: 'PUBLISH_MULTIPLE_QDN_RESOURCES',
    resources: normalized,
  });
  const publishError = parseMultiResourcePublishError(response);
  if (publishError) throw new Error(publishError);
  return response;
};

export const publishJsonResource = async <T = unknown>({
  service,
  name,
  identifier,
  payload,
  verify,
  title,
  description,
  tags,
  filename = 'data.json',
}: PublishJsonParams) => {
  const tagFields = (tags ?? [])
    .slice(0, 5)
    .reduce<Record<string, string>>((fields, tag, index) => {
      fields[`tag${index + 1}`] = tag;
      return fields;
    }, {});

  await requestQortium({
    action: 'PUBLISH_QDN_RESOURCE',
    service,
    name,
    identifier,
    data64: encodeJsonToBase64(payload),
    filename,
    title,
    description,
    ...tagFields,
  });

  await waitForResourceReady(service, name, identifier);
  return verifyJsonResource<T>(service, name, identifier, verify);
};

// ── Delete ─────────────────────────────────────────────────

/**
 * Delete a QDN resource via the Core's native DELETE endpoint.
 *
 * This is a real, permanent deletion — not a tombstone or unpublish.
 * The resource is removed from the QDN network.  After successful
 * deletion, SEARCH and FETCH will no longer return the resource.
 *
 * Contract (from qortium-home platform.ts):
 *   POST /arbitrary/resource/{service}/{name}/{identifier}/delete
 *   (or /arbitrary/public/resource/… for public nodes)
 *   with empty body.  The Home bridge translates this to
 *   action: 'DELETE_QDN_RESOURCE'.
 */
export const deleteQdnResource = async (
  service: string,
  name: string,
  identifier: string,
) => {
  await requestQortium({
    action: 'DELETE_QDN_RESOURCE',
    service,
    name,
    identifier,
  });
};
