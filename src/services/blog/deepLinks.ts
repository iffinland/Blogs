const DEFAULT_SERVICE = 'APP';
const DEFAULT_NAME = 'Blog';
const DEFAULT_IDENTIFIER = 'Blog';

const clean = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const decodeSegment = (value: string | undefined) => {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const getAppBaseAddress = (location: Pick<Location, 'pathname'> = window.location) => {
  const renderMatch = location.pathname.match(/\/render\/([^/]+)\/([^/]+)(?:\/([^/?#]+))?/i);
  const service = clean(window._qdnService) || decodeSegment(renderMatch?.[1]) || DEFAULT_SERVICE;
  const name = clean(window._qdnName) || decodeSegment(renderMatch?.[2]) || DEFAULT_NAME;
  const identifier =
    clean(window._qdnIdentifier) || decodeSegment(renderMatch?.[3]) || DEFAULT_IDENTIFIER;

  return `qdn://${encodeURIComponent(service)}/${encodeURIComponent(name)}/${encodeURIComponent(
    identifier,
  )}`;
};

export const buildBlogLink = (blogId: string) =>
  `${getAppBaseAddress()}?blog=${encodeURIComponent(blogId)}`;

export const buildPostLink = (postIdentifier: string) =>
  `${getAppBaseAddress()}?post=${encodeURIComponent(postIdentifier)}`;

export const getInitialDeepLink = (search = window.location.search) => {
  const params = new URLSearchParams(search);
  return {
    blogId: params.get('blog')?.trim() || null,
    postIdentifier: params.get('post')?.trim() || null,
  };
};
