const BLOG_PREFIX = 'b.';
const POST_PREFIX = 'p.';
const COMMENT_PREFIX = 'c.';
const IMAGE_PREFIX = 'i.';
const VIDEO_PREFIX = 'v.';
const FILE_PREFIX = 'f.';
const MAX_BLOG_HANDLE_LENGTH = 18;
const SHORT_ID_LENGTH = 8;

export const sanitizeIdentifierSegment = (value: string, maxLength = 24) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');

export const createShortId = (length = SHORT_ID_LENGTH) => {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
};

export const toBlogId = (handle: string) => {
  const clean = sanitizeIdentifierSegment(handle, MAX_BLOG_HANDLE_LENGTH);
  if (!clean) throw new Error('Blog handle is required.');
  return `${BLOG_PREFIX}${clean}`;
};

export const createPostId = () => createShortId();
export const createCommentId = () => createShortId(6);
export const createMediaId = () => createShortId(7);

export const toPostIdentifier = (blogId: string, postId: string) =>
  `${POST_PREFIX}${blogId}.${postId}`;
export const toCommentIdentifier = (postId: string, commentId: string) =>
  `${COMMENT_PREFIX}${postId}.${commentId}`;
export const toImageIdentifier = (mediaId: string) => `${IMAGE_PREFIX}${mediaId}`;
export const toVideoIdentifier = (mediaId: string) => `${VIDEO_PREFIX}${mediaId}`;
export const toFileIdentifier = (mediaId: string) => `${FILE_PREFIX}${mediaId}`;

export const parsePostIdentifier = (identifier: string) => {
  const parts = identifier.split('.');
  if (parts.length !== 4 || parts[0] !== 'p' || parts[1] !== 'b') return null;
  return {
    blogId: `${parts[1]}.${parts[2]}`,
    postId: parts[3],
  };
};

export const parseCommentIdentifier = (identifier: string) => {
  const parts = identifier.split('.');
  if (parts.length !== 3 || parts[0] !== 'c') return null;
  return {
    postId: parts[1],
    commentId: parts[2],
  };
};
