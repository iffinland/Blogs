const DEFAULT_NODE_API_URL = 'http://127.0.0.1:24891';

export type QortiumRequest = {
  action: string;
  method?: string;
  path?: string;
  maxBytes?: number;
  [key: string]: unknown;
};

export type NodeApiFetchResult<T = unknown> = {
  body: string;
  contentLength?: number;
  contentType: string;
  data: T;
  ok: boolean;
  status: number;
  statusText: string;
};

export const LOCAL_READ_ACTIONS = [
  'FETCH_NODE_API',
  'FETCH_QDN_RESOURCE',
  'GET_ACCOUNT_NAMES',
  'GET_NODE_STATUS',
  'GET_QDN_RESOURCE_STATUS',
  'GET_QDN_RESOURCE_PROPERTIES',
  'GET_QDN_RESOURCE_METADATA',
  'GET_QDN_RESOURCE_URL',
  'IS_USING_PUBLIC_NODE',
  'LIST_QDN_RESOURCES',
  'SEARCH_QDN_RESOURCES',
  'SHOW_ACTIONS',
  'WHICH_UI',
] as const;

const getNodeApiUrl = () =>
  (import.meta.env.VITE_QORTIUM_NODE_API_URL || DEFAULT_NODE_API_URL).replace(/\/+$/, '');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const parseResponseData = (body: string, contentType: string) => {
  if (!body) return null;
  const first = body.trimStart()[0];
  if (contentType.toLowerCase().includes('json') || first === '[' || first === '{') {
    try {
      return JSON.parse(body) as unknown;
    } catch {
      return body;
    }
  }
  return body;
};

const sanitizeNodePath = (path: unknown) => {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
    throw new Error('Node API paths must start with /.');
  }
  if ([...path].some((character) => character.charCodeAt(0) < 32)) {
    throw new Error('Node API path contains invalid control characters.');
  }
  const url = new URL(path, DEFAULT_NODE_API_URL);
  return `${url.pathname}${url.search}`;
};

const sanitizeReadMethod = (method: unknown) => {
  const normalized =
    typeof method === 'string' && method.trim() ? method.trim().toUpperCase() : 'GET';
  if (normalized !== 'GET' && normalized !== 'HEAD') {
    throw new Error('Only GET and HEAD node API requests are supported in browser development.');
  }
  return normalized;
};

const appendQueryValue = (query: URLSearchParams, key: string, value: unknown) => {
  if (Array.isArray(value)) {
    value.forEach((item) => appendQueryValue(query, key, item));
    return;
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    query.append(key, String(value));
    return;
  }
  if (typeof value === 'string' && value.trim()) {
    query.append(key, value.trim());
  }
};

const buildQdnResourcesPath = (request: QortiumRequest, pathBase: string) => {
  const query = new URLSearchParams();
  const fields: Record<string, string> = {
    default: 'default',
    description: 'description',
    exactMatchNames: 'exactmatchnames',
    excludeBlocked: 'excludeblocked',
    followedOnly: 'followedonly',
    identifier: 'identifier',
    includeMetadata: 'includemetadata',
    includeStatus: 'includestatus',
    keywords: 'keywords',
    limit: 'limit',
    mode: 'mode',
    name: 'name',
    nameListFilter: 'namefilter',
    names: 'name',
    offset: 'offset',
    prefix: 'prefix',
    query: 'query',
    reverse: 'reverse',
    service: 'service',
    title: 'title',
  };

  Object.entries(fields).forEach(([requestKey, queryKey]) => {
    appendQueryValue(query, queryKey, request[requestKey]);
  });

  const queryString = query.toString();
  return `${pathBase}${queryString ? `?${queryString}` : ''}`;
};

const buildFetchQdnResourcePath = (request: QortiumRequest) => {
  const service = getString(request.service).toUpperCase();
  const name = getString(request.name);
  const identifier = getString(request.identifier);
  const resourcePath = getString(request.path) || getString(request.filepath);
  const query = new URLSearchParams();

  if (!service || !name) {
    throw new Error('QDN resource service and name are required.');
  }

  if (resourcePath) query.set('filepath', resourcePath);
  ['encoding', 'rebuild', 'async'].forEach((key) => {
    const value = request[key];
    if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
      query.set(key, String(value));
    }
  });

  const queryString = query.toString();
  return `/arbitrary/${service}/${encodeURIComponent(name)}${
    identifier ? `/${encodeURIComponent(identifier)}` : ''
  }${queryString ? `?${queryString}` : ''}`;
};

const fetchLocalNodeApi = async <T = unknown>(
  request: QortiumRequest,
): Promise<NodeApiFetchResult<T>> => {
  const method = sanitizeReadMethod(request.method);
  const apiPath = sanitizeNodePath(request.path);
  const response = await fetch(`${getNodeApiUrl()}${apiPath}`, { method });
  const contentType = response.headers.get('content-type') ?? '';
  const body = method === 'HEAD' ? '' : await response.text();
  const bodyLength = new TextEncoder().encode(body).byteLength;
  const maxBytes = typeof request.maxBytes === 'number' ? request.maxBytes : 0;

  if (maxBytes > 0 && bodyLength > maxBytes) {
    throw new Error(`Node API response exceeded the ${maxBytes.toLocaleString()} byte limit.`);
  }

  return {
    body,
    contentLength: bodyLength,
    contentType,
    data: parseResponseData(body, contentType) as T,
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
  };
};

const fetchLocalNodeApiData = async <T = unknown>(request: QortiumRequest, path: string) => {
  const result = await fetchLocalNodeApi<T>({ ...request, action: 'FETCH_NODE_API', path });
  if (!result.ok) {
    throw new Error(result.body || `Node API failed with HTTP ${result.status}.`);
  }
  return result.data;
};

const fallbackQortiumRequest = async <T>(request: QortiumRequest): Promise<T> => {
  switch (request.action.toUpperCase()) {
    case 'FETCH_NODE_API':
      return (await fetchLocalNodeApi(request)) as T;
    case 'FETCH_QDN_RESOURCE':
      return (await fetchLocalNodeApiData(request, buildFetchQdnResourcePath(request))) as T;
    case 'GET_NODE_STATUS':
      return (await fetchLocalNodeApiData(request, '/admin/status')) as T;
    case 'GET_ACCOUNT_NAMES':
      return (await fetchLocalNodeApiData(
        request,
        `/names/address/${encodeURIComponent(getString(request.address))}`,
      )) as T;
    case 'GET_QDN_RESOURCE_STATUS':
      return (await fetchLocalNodeApiData(
        request,
        `/arbitrary/resource/status/${encodeURIComponent(getString(request.service))}/${encodeURIComponent(
          getString(request.name),
        )}/${encodeURIComponent(getString(request.identifier))}`,
      )) as T;
    case 'GET_QDN_RESOURCE_URL':
      return `${getNodeApiUrl()}${buildFetchQdnResourcePath(request)}` as T;
    case 'LIST_QDN_RESOURCES':
      return (await fetchLocalNodeApiData(
        request,
        buildQdnResourcesPath(request, '/arbitrary/resources'),
      )) as T;
    case 'SEARCH_QDN_RESOURCES':
      return (await fetchLocalNodeApiData(
        request,
        buildQdnResourcesPath(request, '/arbitrary/resources/search'),
      )) as T;
    case 'IS_USING_PUBLIC_NODE':
      return false as T;
    case 'SHOW_ACTIONS':
      return [...LOCAL_READ_ACTIONS] as T;
    case 'WHICH_UI':
      return 'BROWSER_DEV' as T;
    case 'GET_SELECTED_ACCOUNT':
      throw new Error('Selected account is only available inside Qortium Home.');
    default:
      throw new Error(`${request.action} is not available in local browser development.`);
  }
};

export const hasQortiumBridge = () =>
  typeof window !== 'undefined' && typeof window.qdnRequest === 'function';

export const requestQortium = async <T = unknown>(request: QortiumRequest): Promise<T> => {
  if (!isRecord(request) || typeof request.action !== 'string' || !request.action.trim()) {
    throw new Error('QDN requests must include an action.');
  }

  if (typeof window !== 'undefined' && typeof window.qdnRequest === 'function') {
    return window.qdnRequest<T>(request);
  }

  return fallbackQortiumRequest<T>(request);
};

export const getBridgeActions = async () => {
  try {
    const actions = await requestQortium<unknown>({ action: 'SHOW_ACTIONS' });
    return Array.isArray(actions)
      ? actions.filter((action): action is string => typeof action === 'string')
      : [];
  } catch {
    return [...LOCAL_READ_ACTIONS];
  }
};
