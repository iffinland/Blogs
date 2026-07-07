import type { BlogListItem, BlogPost, BlogProfile } from '../../types/blog';
import { fetchBlogPost, fetchBlogProfile, listBlogs, listPosts } from './blogService';
import { stripRichTextMarkup } from './richText';

export type BlogSearchResult =
  | {
      type: 'blog';
      id: string;
      title: string;
      description: string;
      name: string;
      identifier: string;
      url: string;
      score: number;
      snippet: string;
      profile?: BlogProfile;
    }
  | {
      type: 'post';
      id: string;
      title: string;
      description: string;
      name: string;
      identifier: string;
      url: string;
      score: number;
      snippet: string;
      post?: BlogPost;
    };

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, ' ')
    .replace(/[^a-z0-9\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const createSearchHaystack = (parts: Array<string | null | undefined>) =>
  normalizeText(parts.filter(Boolean).join(' '));

export const tokenizeSearchQuery = (value: string) => {
  const normalized = normalizeText(value);
  return normalized ? normalized.split(' ') : [];
};

const scoreHaystack = (haystack: string, tokens: string[]) => {
  if (tokens.length === 0 || !tokens.every((token) => haystack.includes(token))) return 0;
  return tokens.reduce((score, token) => score + (haystack.split(token).length - 1), 0);
};

const createSnippet = (text: string, tokens: string[]) => {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const normalized = normalizeText(clean);
  const index = tokens
    .map((token) => normalized.indexOf(token))
    .filter((value) => value >= 0)
    .sort((a, b) => a - b)[0];
  const start = Math.max(0, (index ?? 0) - 80);
  const end = Math.min(clean.length, start + 220);
  return `${start > 0 ? '...' : ''}${clean.slice(start, end)}${end < clean.length ? '...' : ''}`;
};

const safeFetchBlogProfile = async (item: BlogListItem) => {
  try {
    return await fetchBlogProfile(item.name, item.identifier);
  } catch {
    return null;
  }
};

const safeFetchBlogPost = async (item: BlogListItem) => {
  try {
    return await fetchBlogPost(item.name, item.identifier);
  } catch {
    return null;
  }
};

const listAllPosts = async (maxItems = 180) => {
  const limit = 60;
  const items: BlogListItem[] = [];

  for (let offset = 0; offset < maxItems; offset += limit) {
    const page = await listPosts(undefined, offset, limit);
    items.push(...page);
    if (page.length < limit) break;
  }

  return items;
};

export const searchBlogsAndPosts = async (query: string): Promise<BlogSearchResult[]> => {
  const tokens = tokenizeSearchQuery(query);
  if (tokens.length === 0) return [];

  const [blogItems, postItems] = await Promise.all([listBlogs(), listAllPosts()]);
  const [profiles, posts] = await Promise.all([
    Promise.all(blogItems.map(safeFetchBlogProfile)),
    Promise.all(postItems.map(safeFetchBlogPost)),
  ]);

  const blogResults = blogItems
    .map((item, index): BlogSearchResult | null => {
      const profile = profiles[index];
      const title = profile?.title || item.title || item.identifier;
      const description = profile?.description || item.description || '';
      const haystack = createSearchHaystack([
        title,
        description,
        item.name,
        item.identifier,
        ...(profile?.tags ?? item.tags ?? []),
      ]);
      const score = scoreHaystack(haystack, tokens);
      if (score === 0) return null;

      return {
        type: 'blog',
        id: `${item.name}:${item.identifier}`,
        title,
        description,
        name: item.name,
        identifier: item.identifier,
        url: `/blog/${item.name}/${item.identifier}`,
        score: score + 3,
        snippet: createSnippet(`${title}. ${description}`, tokens),
        profile: profile ?? undefined,
      };
    })
    .filter((item): item is BlogSearchResult => Boolean(item));

  const postResults = postItems
    .map((item, index): BlogSearchResult | null => {
      const post = posts[index];
      const title = post?.title || item.title || item.identifier;
      const body = stripRichTextMarkup(
        post?.blocks
          .filter((block) => block.type === 'text')
          .map((block) => block.content)
          .join(' ') ?? '',
      );
      const description = post?.excerpt || item.description || body.slice(0, 180);
      const haystack = createSearchHaystack([
        title,
        description,
        body,
        post?.category,
        post?.ownerName,
        item.name,
        item.identifier,
        ...(post?.tags ?? item.tags ?? []),
      ]);
      const score = scoreHaystack(haystack, tokens);
      if (score === 0) return null;

      return {
        type: 'post',
        id: `${item.name}:${item.identifier}`,
        title,
        description,
        name: item.name,
        identifier: item.identifier,
        url: `/post/${item.name}/${item.identifier}`,
        score: score + 1,
        snippet: createSnippet(`${title}. ${description}. ${body}`, tokens),
        post: post ?? undefined,
      };
    })
    .filter((item): item is BlogSearchResult => Boolean(item));

  return [...blogResults, ...postResults]
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, 12);
};

export const getSearchHighlightTokens = (query: string) =>
  [...new Set(tokenizeSearchQuery(query))]
    .filter((token) => token.length > 0)
    .sort((a, b) => b.length - a.length);

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const createSearchHighlightPattern = (query: string) => {
  const tokens = getSearchHighlightTokens(query);
  return tokens.length > 0 ? new RegExp(`(${tokens.map(escapeRegExp).join('|')})`, 'gi') : null;
};
