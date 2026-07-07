import type {
  BlogComment,
  BlogListItem,
  BlogPost,
  BlogProfile,
  BlogSettings,
  QdnResourceRef,
} from '../../types/blog';
import { getSelectedAccount } from '../qortium/accountService';
import {
  createCommentId,
  createPostId,
  toBlogId,
  toCommentIdentifier,
  toPostIdentifier,
} from '../qdn/identifiers';
import { fetchJsonResource, publishJsonResource, searchResources } from '../qdn/qdnService';
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

export const listPosts = async (blogId?: string, offset = 0, limit = 30) => {
  return searchResources({
    service: 'BLOG_POST',
    identifier: blogId ? `p.${blogId}.` : 'p.',
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

export const resolveBlogPost = async (ownerName: string, postIdentifier: string) => {
  if (ownerName && ownerName !== '_') return fetchBlogPost(ownerName, postIdentifier);

  const matches = await searchResources({
    service: 'BLOG_POST',
    identifier: postIdentifier,
    prefix: false,
    includeMetadata: true,
    limit: 10,
  });
  const latest = [...matches].sort(
    (a, b) => (b.updated ?? b.created ?? 0) - (a.updated ?? a.created ?? 0),
  )[0];
  if (!latest) throw new Error('Post was not found on QDN.');
  return fetchBlogPost(latest.name, latest.identifier);
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

export const createPost = async (params: {
  blog: BlogProfile;
  title: string;
  body: string;
  category: string;
  tags: string[];
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

  await publishJsonResource<BlogPost>({
    service: 'BLOG_POST',
    name: ownerName,
    identifier,
    payload: post,
    verify: isBlogPost,
    title: post.title,
    description: post.excerpt,
    tags: post.tags,
    filename: 'post.json',
  });

  return { post, identifier };
};

export const updatePost = async (params: {
  post: BlogPost;
  title: string;
  body: string;
  category: string;
  tags: string[];
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

  await publishJsonResource<BlogPost>({
    service: 'BLOG_POST',
    name: ownerName,
    identifier,
    payload: updatedPost,
    verify: isBlogPost,
    title: updatedPost.title,
    description: updatedPost.excerpt,
    tags: updatedPost.tags,
    filename: 'post.json',
  });

  return { post: updatedPost, identifier };
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
