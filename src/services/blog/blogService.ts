import type {
  BlogComment,
  BlogListItem,
  BlogPost,
  BlogProfile,
  BlogSettings,
  QdnResourceRef,
} from '../../types/blog';
import type { PendingBlogMedia } from './mediaService';
import { getSelectedAccount } from '../qortium/accountService';
import {
  createCommentId,
  createPostId,
  toBlogId,
  toCommentIdentifier,
  toPostIdentifier,
} from '../qdn/identifiers';
import {
  createJsonResourceToPublish,
  deleteQdnResource,
  fetchJsonResource,
  fetchJsonResourceWithReadiness,
  publishJsonResource,
  publishMultipleQdnResources,
  QdnResourceError,
  searchResources,
  verifyJsonResource,
  waitForResourceReady,
} from '../qdn/qdnService';
import { stripRichTextMarkup } from './richText';

const DEFAULT_SETTINGS: BlogSettings = {
  allowComments: true,
  allowTips: true,
  listed: true,
};

const getMetadataString = (item: BlogListItem, key: 'title' | 'description') => {
  const value = item[key];
  return typeof value === 'string' ? value : '';
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isBlogProfile = (value: unknown): value is BlogProfile =>
  isRecord(value) &&
  value.schema === 'qortium.blog.profile.v1' &&
  value.version === 1 &&
  typeof value.blogId === 'string' &&
  typeof value.ownerName === 'string';

const isBlogPost = (value: unknown): value is BlogPost =>
  isRecord(value) &&
  value.schema === 'qortium.blog.post.v1' &&
  value.version === 1 &&
  typeof value.blogId === 'string' &&
  typeof value.postId === 'string';

const isBlogComment = (value: unknown): value is BlogComment =>
  isRecord(value) &&
  value.schema === 'qortium.blog.comment.v1' &&
  value.version === 1 &&
  typeof value.postId === 'string' &&
  typeof value.commentId === 'string';

const requireOwnedName = (accountNames: string[], name: string) => {
  const normalizedName = name.trim();
  if (!normalizedName || !accountNames.includes(normalizedName)) {
    throw new Error('Selected publishing name is not available on this account.');
  }
  return normalizedName;
};

export const listBlogs = async (name?: string) => {
  return searchResources({
    service: 'BLOG',
    identifier: 'b.',
    name,
    exactMatchNames: Boolean(name),
    prefix: true,
    includeMetadata: true,
    limit: 100,
  });
};

export const listBlogsForNames = async (names: string[]) => {
  const cleanNames = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
  if (cleanNames.length === 0) return [];
  return searchResources({
    service: 'BLOG',
    identifier: 'b.',
    names: cleanNames,
    exactMatchNames: true,
    prefix: true,
    includeMetadata: true,
    limit: 100,
  });
};

export const listPosts = async (
  blogId?: string,
  offset = 0,
  limit = 30,
  name?: string,
) => {
  return searchResources({
    service: 'BLOG_POST',
    identifier: blogId ? `p.${blogId}.` : 'p.',
    name,
    exactMatchNames: Boolean(name),
    prefix: true,
    includeMetadata: true,
    limit,
    offset,
  });
};

const addTaxonomyValue = (target: Map<string, string>, value?: string) => {
  const normalized = value?.trim().replace(/\s+/g, ' ');
  if (!normalized) return;
  const key = normalized.toLowerCase();
  if (!target.has(key)) target.set(key, normalized);
};

export const listUsedTaxonomy = async () => {
  const categories = new Map<string, string>();
  const tags = new Map<string, string>();
  const [blogs, posts] = await Promise.all([listBlogs(), listPosts(undefined, 0, 100)]);

  blogs.forEach((item) => {
    item.tags?.forEach((tag) => addTaxonomyValue(tags, tag));
  });

  const loadedPosts = await Promise.allSettled(
    posts.map((item) => fetchJsonResource<BlogPost>('BLOG_POST', item.name, item.identifier)),
  );

  loadedPosts.forEach((result) => {
    if (result.status !== 'fulfilled' || result.value.status !== 'published') return;
    addTaxonomyValue(categories, result.value.category);
    result.value.tags.forEach((tag) => addTaxonomyValue(tags, tag));
  });

  return {
    categories: [...categories.values()].sort((a, b) => a.localeCompare(b)),
    tags: [...tags.values()].sort((a, b) => a.localeCompare(b)),
  };
};

export const listComments = async (postId: string) => {
  const items = await searchResources({
    service: 'BLOG_COMMENT',
    identifier: `c.${postId}.`,
    prefix: true,
    includeMetadata: false,
    limit: 100,
  });

  const comments = await Promise.allSettled(
    items.map((item) => fetchJsonResource<BlogComment>('BLOG_COMMENT', item.name, item.identifier)),
  );

  return comments
    .filter(
      (result): result is PromiseFulfilledResult<BlogComment> => result.status === 'fulfilled',
    )
    .map((result) => result.value)
    .filter(
      (comment) => comment.schema === 'qortium.blog.comment.v1' && comment.status === 'published',
    )
    .sort((a, b) => a.createdAt - b.createdAt);
};

export const fetchBlogProfile = (ownerName: string, blogId: string) =>
  fetchJsonResource<BlogProfile>('BLOG', ownerName, blogId);

export const fetchBlogPost = (ownerName: string, postIdentifier: string) =>
  fetchJsonResource<BlogPost>('BLOG_POST', ownerName, postIdentifier);

/**
 * Critical-read variants that poll for readiness when the resource is
 * temporarily unavailable (QDN error 1401).  Use only for authoritative
 * page-level loads — not for list cards, post rows, or bulk fetches.
 */
export const fetchBlogProfileReady = (ownerName: string, blogId: string) =>
  fetchJsonResourceWithReadiness<BlogProfile>('BLOG', ownerName, blogId);

export const fetchBlogPostReady = (ownerName: string, postIdentifier: string) =>
  fetchJsonResourceWithReadiness<BlogPost>('BLOG_POST', ownerName, postIdentifier);

/**
 * Resolve a blog post with readiness polling on the direct (non-_)
 * path.  The _ resolver already handles 1401 internally.
 */
export const resolveBlogPostReady = async (ownerName: string, postIdentifier: string) => {
  if (ownerName && ownerName !== '_') {
    return fetchBlogPostReady(ownerName, postIdentifier);
  }
  return resolveBlogPost(ownerName, postIdentifier);
};

export const resolveBlogPost = async (ownerName: string, postIdentifier: string) => {
  if (ownerName && ownerName !== '_') return fetchBlogPost(ownerName, postIdentifier);

  // _ resolver (legacy fallback): search across publishers for the
  // exact identifier.  To prevent a cross-publisher collision from
  // silently selecting the wrong publisher, validate that the embedded
  // ownerName matches the QDN publisher name.  The first truthful
  // publisher (by QDN metadata recency) wins.
  const matches = await searchResources({
    service: 'BLOG_POST',
    identifier: postIdentifier,
    prefix: false,
    includeMetadata: true,
    limit: 10,
  });
  const sorted = [...matches].sort(
    (a, b) => (b.updated ?? b.created ?? 0) - (a.updated ?? a.created ?? 0),
  );

  let hadUnavailableCandidate = false;

  for (const candidate of sorted) {
    try {
      const post = await fetchBlogPost(candidate.name, candidate.identifier);
      if (post.ownerName === candidate.name && post.status === 'published') return post;
    } catch (error) {
      if (error instanceof QdnResourceError && error.code === 1401) {
        // Temporarily unverifiable — poll briefly.  If the
        // candidate becomes available, validate and return it.
        // If it stays unavailable, skip to the next candidate
        // instead of blocking resolution entirely.
        hadUnavailableCandidate = true;
        try {
          const post = await fetchJsonResourceWithReadiness<BlogPost>(
            'BLOG_POST',
            candidate.name,
            candidate.identifier,
            3_000,
          );
          if (post.ownerName === candidate.name && post.status === 'published') return post;
          // Became available but not truthful — fall through.
        } catch {
          // Still unavailable after sub-budget — continue.
        }
        continue;
      }
      // Non-1401 error — skip and try next candidate.
    }
  }

  if (hadUnavailableCandidate) {
    throw new QdnResourceError(
      1401,
      'Post data is temporarily unavailable. Please try again.',
    );
  }

  throw new Error('Post was not found on QDN.');
};

export const createBlog = async (params: {
  ownerName?: string;
  handle: string;
  title: string;
  description: string;
  tags: string[];
  avatar?: QdnResourceRef;
  cover?: QdnResourceRef;
}) => {
  const account = await getSelectedAccount();
  if (account.names.length === 0) {
    throw new Error('A registered Qortium name is required to create a blog.');
  }
  const ownerName = requireOwnedName(account.names, params.ownerName || account.name);

  const now = Date.now();
  const blogId = toBlogId(params.handle);
  const existing = await listBlogs(ownerName);
  if (existing.some((item) => item.identifier === blogId)) {
    throw new Error('A blog with this handle already exists for the selected name.');
  }
  const profile: BlogProfile = {
    schema: 'qortium.blog.profile.v1',
    version: 1,
    blogId,
    ownerName,
    title: params.title.trim(),
    description: params.description.trim(),
    avatar: params.avatar,
    cover: params.cover,
    tags: params.tags,
    createdAt: now,
    updatedAt: now,
    settings: DEFAULT_SETTINGS,
  };

  await publishJsonResource<BlogProfile>({
    service: 'BLOG',
    name: ownerName,
    identifier: blogId,
    payload: profile,
    verify: isBlogProfile,
    title: profile.title,
    description: profile.description,
    tags: profile.tags,
    filename: 'blog.json',
  });

  return profile;
};

export const updateBlog = async (params: {
  profile: BlogProfile;
  title: string;
  description: string;
  tags: string[];
  avatar?: QdnResourceRef;
  cover?: QdnResourceRef;
}) => {
  const account = await getSelectedAccount();
  if (account.names.length === 0) {
    throw new Error('A registered Qortium name is required to edit a blog.');
  }
  const ownerName = requireOwnedName(account.names, params.profile.ownerName);
  const updatedProfile: BlogProfile = {
    ...params.profile,
    ownerName,
    title: params.title.trim(),
    description: params.description.trim(),
    tags: params.tags,
    avatar: params.avatar,
    cover: params.cover,
    updatedAt: Date.now(),
  };

  await publishJsonResource<BlogProfile>({
    service: 'BLOG',
    name: ownerName,
    identifier: updatedProfile.blogId,
    payload: updatedProfile,
    verify: isBlogProfile,
    title: updatedProfile.title,
    description: updatedProfile.description,
    tags: updatedProfile.tags,
    filename: 'blog.json',
  });

  return updatedProfile;
};

const getReferencedPendingMedia = (body: string, pendingMedia?: PendingBlogMedia[]) => {
  const seen = new Set<string>();
  return (pendingMedia ?? []).filter((item) => {
    const key = `${item.ref.service}:${item.ref.name}:${item.ref.identifier}`;
    if (seen.has(key) || !body.includes(item.ref.identifier)) return false;
    seen.add(key);
    return true;
  });
};

const publishPostWithMedia = async ({
  post,
  identifier,
  pendingMedia,
}: {
  post: BlogPost;
  identifier: string;
  pendingMedia?: PendingBlogMedia[];
}) => {
  const referencedMedia = getReferencedPendingMedia(
    post.blocks
      .filter((block) => block.type === 'text')
      .map((block) => block.content)
      .join('\n\n'),
    pendingMedia,
  );

  if (referencedMedia.length === 0) {
    await publishJsonResource<BlogPost>({
      service: 'BLOG_POST',
      name: post.ownerName,
      identifier,
      payload: post,
      verify: isBlogPost,
      title: post.title,
      description: post.excerpt,
      tags: post.tags,
      filename: 'post.json',
    });
    return;
  }

  await publishMultipleQdnResources([
    ...referencedMedia.map((item) => item.resource),
    createJsonResourceToPublish({
      service: 'BLOG_POST',
      name: post.ownerName,
      identifier,
      payload: post,
      title: post.title,
      description: post.excerpt,
      tags: post.tags,
      filename: 'post.json',
    }),
  ]);

  await Promise.all([
    verifyJsonResource<BlogPost>('BLOG_POST', post.ownerName, identifier, isBlogPost),
    ...referencedMedia.map((item) =>
      waitForResourceReady(item.ref.service, item.ref.name, item.ref.identifier),
    ),
  ]);
};

export const createPost = async (params: {
  blog: BlogProfile;
  title: string;
  body: string;
  category: string;
  tags: string[];
  pendingMedia?: PendingBlogMedia[];
}) => {
  const account = await getSelectedAccount();
  if (account.names.length === 0) {
    throw new Error('A registered Qortium name is required to publish a post.');
  }
  const ownerName = requireOwnedName(account.names, params.blog.ownerName);

  const postId = createPostId();
  const identifier = toPostIdentifier(params.blog.blogId, postId);
  const now = Date.now();
  const excerpt = stripRichTextMarkup(params.body).slice(0, 180);
  const post: BlogPost = {
    schema: 'qortium.blog.post.v1',
    version: 1,
    blogId: params.blog.blogId,
    postId,
    ownerName,
    title: params.title.trim(),
    excerpt,
    category: params.category.trim(),
    tags: params.tags,
    blocks: [
      {
        id: 't1',
        type: 'text',
        version: 1,
        content: params.body,
      },
    ],
    createdAt: now,
    updatedAt: now,
    status: 'published',
  };

  await publishPostWithMedia({ post, identifier, pendingMedia: params.pendingMedia });

  return { post, identifier };
};

export const updatePost = async (params: {
  post: BlogPost;
  title: string;
  body: string;
  category: string;
  tags: string[];
  pendingMedia?: PendingBlogMedia[];
}) => {
  const account = await getSelectedAccount();
  if (account.names.length === 0) {
    throw new Error('A registered Qortium name is required to edit a post.');
  }
  const ownerName = requireOwnedName(account.names, params.post.ownerName);
  const identifier = toPostIdentifier(params.post.blogId, params.post.postId);
  const excerpt = stripRichTextMarkup(params.body).slice(0, 180);
  const updatedPost: BlogPost = {
    ...params.post,
    ownerName,
    title: params.title.trim(),
    excerpt,
    category: params.category.trim(),
    tags: params.tags,
    blocks: [
      {
        id: 't1',
        type: 'text',
        version: 1,
        content: params.body,
      },
    ],
    updatedAt: Date.now(),
    status: 'published',
  };

  await publishPostWithMedia({ post: updatedPost, identifier, pendingMedia: params.pendingMedia });

  return { post: updatedPost, identifier };
};

/**
 * Delete a blog post.
 *
 * Canonical target: (BLOG_POST, ownerName, identifier).
 * Ownership is verified client-side (UX only) — the Qortium Core
 * remains the authoritative security boundary.
 *
 * Deletion is permanent native removal (not a tombstone).
 * After success the resource will not appear in SEARCH or FETCH.
 */
export const deleteBlogPost = async (ownerName: string, postIdentifier: string) => {
  const account = await getSelectedAccount();
  if (account.names.length === 0) {
    throw new Error('A registered Qortium name is required to delete a post.');
  }
  requireOwnedName(account.names, ownerName);
  await deleteQdnResource('BLOG_POST', ownerName, postIdentifier);
};

/**
 * Delete a blog profile.
 *
 * Canonical target: (BLOG, ownerName, blogId).
 *
 * IMPORTANT: Deleting a BLOG resource does NOT cascade to
 * BLOG_POST resources.  Each post is an independent QDN resource.
 * Callers must check for orphan posts before deletion.
 *
 * Returns the count of remaining posts for the caller to decide
 * whether to proceed — a non-zero count means posts still exist.
 */
export const deleteBlog = async (ownerName: string, blogId: string) => {
  const account = await getSelectedAccount();
  if (account.names.length === 0) {
    throw new Error('A registered Qortium name is required to delete a blog.');
  }
  requireOwnedName(account.names, ownerName);
  await deleteQdnResource('BLOG', ownerName, blogId);
};

/**
 * Check how many posts exist in a blog.  Used as an orphan-content
 * safety gate before blog deletion.
 */
export const countPostsInBlog = async (blogId: string, ownerName: string) => {
  const items = await listPosts(blogId, 0, 100, ownerName);
  return items.length;
};

export const createComment = async (params: { blogId: string; postId: string; body: string }) => {
  const account = await getSelectedAccount();
  if (!account.name) throw new Error('A registered Qortium name is required to comment.');

  const commentId = createCommentId();
  const identifier = toCommentIdentifier(params.postId, commentId);
  const now = Date.now();
  const comment: BlogComment = {
    schema: 'qortium.blog.comment.v1',
    version: 1,
    blogId: params.blogId,
    postId: params.postId,
    commentId,
    authorName: account.name,
    body: params.body.trim(),
    createdAt: now,
    updatedAt: now,
    status: 'published',
  };

  await publishJsonResource<BlogComment>({
    service: 'BLOG_COMMENT',
    name: account.name,
    identifier,
    payload: comment,
    verify: isBlogComment,
    title: `Comment on ${params.postId}`,
    description: comment.body.slice(0, 120),
    filename: 'comment.json',
  });

  return comment;
};

export const toBlogCard = (item: BlogListItem) => ({
  name: item.name,
  identifier: item.identifier,
  title: getMetadataString(item, 'title') || item.identifier,
  description: getMetadataString(item, 'description'),
  tags: item.tags ?? [],
  updated: item.updated ?? item.created ?? 0,
});
