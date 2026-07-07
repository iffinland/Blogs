import type { AccountProfile, BlogLike, BlogLikeTargetType } from '../../types/blog';
import { sanitizeIdentifierSegment } from '../qdn/identifiers';
import { publishJsonResource, searchResources } from '../qdn/qdnService';

const LIKE_PREFIX = 'ql.';
const PAGE_SIZE = 100;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isBlogLike = (value: unknown): value is BlogLike =>
  isRecord(value) &&
  value.schema === 'qortium.blog.like.v1' &&
  value.version === 1 &&
  typeof value.targetType === 'string' &&
  typeof value.targetOwnerName === 'string' &&
  typeof value.targetIdentifier === 'string';

const hashKey = (value: string) => {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return Math.abs(hash >>> 0).toString(36);
};

const getAuthorKey = (account: AccountProfile) =>
  sanitizeIdentifierSegment(account.address || account.name || account.names[0] || 'anon', 18);

const ownsTarget = (account: AccountProfile | null, ownerName: string) => {
  if (!account) return false;
  const normalizedOwner = ownerName.trim().toLowerCase();
  return account.names.some((name) => name.trim().toLowerCase() === normalizedOwner);
};

const getTargetKey = (params: {
  targetType: BlogLikeTargetType;
  ownerName: string;
  identifier: string;
}) => hashKey(`${params.targetType}:${params.ownerName}:${params.identifier}`);

const getLikePrefix = (params: {
  targetType: BlogLikeTargetType;
  ownerName: string;
  identifier: string;
}) => `${LIKE_PREFIX}${getTargetKey(params)}.`;

const getLikeIdentifier = (
  params: { targetType: BlogLikeTargetType; ownerName: string; identifier: string },
  account: AccountProfile,
) => `${getLikePrefix(params)}${getAuthorKey(account)}`;

const getAuthorKeyFromIdentifier = (identifier: string) => identifier.split('.').at(-1) ?? '';

export const fetchLikeState = async (params: {
  targetType: BlogLikeTargetType;
  ownerName: string;
  identifier: string;
  account: AccountProfile | null;
}) => {
  const prefix = getLikePrefix(params);
  const items = await searchResources({
    service: 'DOCUMENT',
    identifier: prefix,
    prefix: true,
    includeMetadata: false,
    limit: PAGE_SIZE,
  });
  const authorKeys = new Set(items.map((item) => getAuthorKeyFromIdentifier(item.identifier)));
  const accountAuthorKey = params.account ? getAuthorKey(params.account) : '';

  return {
    count: authorKeys.size,
    likedByAccount: Boolean(accountAuthorKey && authorKeys.has(accountAuthorKey)),
    ownedByAccount: ownsTarget(params.account, params.ownerName),
  };
};

export const publishLike = async (params: {
  targetType: BlogLikeTargetType;
  ownerName: string;
  identifier: string;
  title: string;
  account: AccountProfile;
}) => {
  if (ownsTarget(params.account, params.ownerName)) {
    throw new Error('Owners cannot like their own content.');
  }

  const existing = await fetchLikeState(params);
  if (existing.likedByAccount) {
    throw new Error('This account has already liked this item.');
  }

  const authorName = params.account.name || params.account.names[0];
  if (!authorName) {
    throw new Error('A registered Qortium name is required to like content.');
  }

  const payload: BlogLike = {
    schema: 'qortium.blog.like.v1',
    version: 1,
    targetType: params.targetType,
    targetOwnerName: params.ownerName,
    targetIdentifier: params.identifier,
    authorName,
    authorAddress: params.account.address,
    createdAt: Date.now(),
  };

  await publishJsonResource<BlogLike>({
    service: 'DOCUMENT',
    name: authorName,
    identifier: getLikeIdentifier(params, params.account),
    payload,
    verify: isBlogLike,
    title: `Like on ${params.title || params.identifier}`.slice(0, 55),
    description: `${params.targetType} like`,
    filename: 'like.json',
  });

  return payload;
};
