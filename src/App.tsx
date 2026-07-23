import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  BookOpenText,
  CircleUserRound,
  Edit3,
  FilePenLine,
  Home,
  Image,
  Moon,
  Plus,
  Sun,
  X,
} from 'lucide-react';
import type {
  AccountProfile,
  BlogListItem,
  BlogPost,
  BlogProfile,
  QdnResourceRef,
} from './types/blog';
import { RichTextContent } from './components/editor/RichTextContent';
import { RichTextEditor } from './components/editor/RichTextEditor';
import { GlobalSearch } from './components/search/GlobalSearch';
import { SocialActions } from './components/social/SocialActions';
import {
  applyDisplaySettings,
  getDisplaySettingsUpdateFromMessage,
  getInitialDisplaySettings,
  persistTheme,
  type DisplaySettings,
} from './displaySettings';
import { getSelectedAccount } from './services/qortium/accountService';
import { hasQortiumBridge } from './services/qortium/qortiumClient';
import {
  createBlog,
  createComment,
  createPost,
  fetchBlogProfile,
  fetchBlogProfileReady,
  listBlogs,
  listBlogsForNames,
  listComments,
  listPosts,
  listUsedTaxonomy,
  resolveBlogPost,
  resolveBlogPostReady,
  updateBlog,
  fetchBlogPost,
  updatePost,
} from './services/blog/blogService';
import { type PendingBlogMedia, publishBlogImage } from './services/blog/mediaService';
import { findFirstQdnImageRef } from './services/blog/richText';
import { buildBlogLink, buildPostLink, getInitialDeepLink } from './services/blog/deepLinks';
import { getQdnResourceUrl } from './services/qdn/qdnService';
import { parsePostIdentifier } from './services/qdn/identifiers';
import { createTranslator } from './i18n';
import defaultBlogCover from './assets/default-blog-cover.svg';
import defaultPostCover from './assets/default-post-cover.svg';

type LoadState<T> =
  | { status: 'idle' | 'loading'; data: T }
  | { status: 'ready'; data: T }
  | { status: 'error'; data: T; message: string };

const emptyList: BlogListItem[] = [];
type HomeView = 'posts' | 'blogs';
type SortOrder = 'newest' | 'oldest';

const socialLabels = (t: ReturnType<typeof createTranslator>) => ({
  like: t('social.like'),
  share: t('social.share'),
  comments: t('social.comments'),
  copied: t('social.copied'),
});

type AppLocaleContextValue = {
  account: AccountProfile | null;
  displaySettings: DisplaySettings;
  formatDate: (value?: number) => string;
  t: ReturnType<typeof createTranslator>;
};

const AppLocaleContext = createContext<AppLocaleContextValue | null>(null);

const useAppLocale = () => {
  const value = useContext(AppLocaleContext);
  if (!value) throw new Error('App locale context is missing.');
  return value;
};

const splitTags = (value: string) =>
  value
    .split(',')
    .map((tag) => normalizeTaxonomyValue(tag))
    .filter(Boolean)
    .slice(0, 5);

const normalizeTaxonomyValue = (value: string) => value.trim().replace(/\s+/g, ' ');

const useTaxonomySuggestions = () => {
  const [categories, setCategories] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    void listUsedTaxonomy()
      .then((taxonomy) => {
        if (!active) return;
        setCategories(taxonomy.categories);
        setTags(taxonomy.tags);
      })
      .catch(() => {
        if (!active) return;
        setCategories([]);
        setTags([]);
      });

    return () => {
      active = false;
    };
  }, []);

  return { categories, tags };
};

const getCanonicalTaxonomyValue = (value: string, suggestions: string[]) => {
  const normalized = normalizeTaxonomyValue(value);
  if (!normalized) return '';
  return (
    suggestions.find((suggestion) => suggestion.toLowerCase() === normalized.toLowerCase()) ??
    normalized
  );
};

const getCanonicalTags = (value: string, suggestions: string[]) => {
  const seen = new Set<string>();
  return splitTags(value).reduce<string[]>((items, tag) => {
    const canonical = getCanonicalTaxonomyValue(tag, suggestions);
    const key = canonical.toLowerCase();
    if (!key || seen.has(key)) return items;
    seen.add(key);
    items.push(canonical);
    return items;
  }, []);
};

const mergePendingMedia = (items: PendingBlogMedia[], item: PendingBlogMedia) => {
  const key = `${item.ref.service}:${item.ref.name}:${item.ref.identifier}`;
  if (
    items.some(
      (current) => `${current.ref.service}:${current.ref.name}:${current.ref.identifier}` === key,
    )
  ) {
    return items;
  }
  return [...items, item];
};

const getTaxonomyUrl = (type: 'category' | 'tag', value: string) =>
  `/?${type}=${encodeURIComponent(value)}`;

const matchesTaxonomyFilter = (
  post: BlogPost | null | undefined,
  filter: { type: 'category' | 'tag'; value: string } | null,
) => {
  if (!filter) return true;
  if (!post) return false;
  const value = filter.value.toLowerCase();
  if (filter.type === 'category') return post.category.trim().toLowerCase() === value;
  return post.tags.some((tag) => tag.trim().toLowerCase() === value);
};

function Shell({
  account,
  onToggleTheme,
}: {
  account: AccountProfile | null;
  onToggleTheme: () => void;
}) {
  const { displaySettings, t } = useAppLocale();
  const nextTheme = displaySettings.theme === 'light' ? 'dark' : 'light';

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/">
          <BookOpenText size={24} />
          <span>{t('app.name')}</span>
        </Link>
        <GlobalSearch
          placeholder={t('search.placeholder')}
          emptyLabel={t('search.empty')}
          loadingLabel={t('search.loading')}
          resultTypeLabels={{ blog: t('search.blog'), post: t('search.post') }}
        />
        <nav className="nav-actions">
          <Link className="icon-button" to="/" title={t('nav.home')}>
            <Home size={18} />
          </Link>
          <MyBlogNavLink account={account} />
          <Link className="command-button" to="/blog/new">
            <Plus size={18} />
            <span>{t('nav.newBlog')}</span>
          </Link>
          <Link className="command-button" to="/post/new">
            <FilePenLine size={18} />
            <span>{t('nav.newPost')}</span>
          </Link>
          <button
            className="theme-toggle"
            type="button"
            onClick={onToggleTheme}
            title={t('theme.toggle')}
            aria-label={t('theme.toggle')}
          >
            {displaySettings.theme === 'light' ? <Sun size={18} /> : <Moon size={18} />}
            <span>{nextTheme === 'light' ? t('theme.light') : t('theme.dark')}</span>
          </button>
          <div className="account-pill" title={account?.address || 'No selected account'}>
            <CircleUserRound size={18} />
            <span>{account?.name || t('account.guest')}</span>
          </div>
        </nav>
      </header>
      <main className="main-surface">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/blog/new" element={<CreateBlogPage />} />
          <Route path="/blog/:name/:blogId" element={<BlogPage />} />
          <Route path="/blog/:name/:blogId/edit" element={<EditBlogPage />} />
          <Route path="/post/new" element={<CreatePostPage />} />
          <Route path="/post/:name/:postIdentifier" element={<PostPage />} />
          <Route path="/post/:name/:postIdentifier/edit" element={<EditPostPage />} />
        </Routes>
      </main>
    </div>
  );
}

function MyBlogNavLink({ account }: { account: AccountProfile | null }) {
  const { t } = useAppLocale();
  const [target, setTarget] = useState('/blog/new');

  useEffect(() => {
    let active = true;

    const loadTarget = async () => {
      if (!account?.names.length) {
        setTarget('/blog/new');
        return;
      }

      try {
        const blogs = await listBlogsForNames(account.names);
        const latestBlog = [...blogs].sort(
          (a, b) => (b.updated ?? b.created ?? 0) - (a.updated ?? a.created ?? 0),
        )[0];
        if (!active) return;
        setTarget(latestBlog ? `/blog/${latestBlog.name}/${latestBlog.identifier}` : '/blog/new');
      } catch {
        if (active) setTarget('/blog/new');
      }
    };

    void loadTarget();
    return () => {
      active = false;
    };
  }, [account?.names]);

  return (
    <Link className="command-button" to={target}>
      <BookOpenText size={18} />
      <span>{t('nav.myBlog')}</span>
    </Link>
  );
}

function HomePage() {
  const { t } = useAppLocale();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeView, setActiveView] = useState<HomeView>('posts');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [blogs, setBlogs] = useState<LoadState<BlogListItem[]>>({
    status: 'loading',
    data: emptyList,
  });
  const [posts, setPosts] = useState<LoadState<BlogListItem[]>>({
    status: 'loading',
    data: emptyList,
  });
  const [postDetails, setPostDetails] = useState<Record<string, BlogPost | null>>({});
  const categoryFilter = normalizeTaxonomyValue(searchParams.get('category') ?? '');
  const tagFilter = normalizeTaxonomyValue(searchParams.get('tag') ?? '');
  const taxonomyFilter = useMemo(
    () =>
      categoryFilter
        ? { type: 'category' as const, value: categoryFilter }
        : tagFilter
          ? { type: 'tag' as const, value: tagFilter }
          : null,
    [categoryFilter, tagFilter],
  );

  const load = useCallback(async () => {
    setBlogs((state) => ({ ...state, status: 'loading' }));
    setPosts((state) => ({ ...state, status: 'loading' }));
    try {
      const [blogItems, postItems] = await Promise.all([listBlogs(), listPosts()]);
      setBlogs({ status: 'ready', data: blogItems });
      setPosts({ status: 'ready', data: postItems });
    } catch (error) {
      const message = error instanceof Error ? error.message : t('error.loadQdnResources');
      setBlogs({ status: 'error', data: emptyList, message });
      setPosts({ status: 'error', data: emptyList, message });
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!taxonomyFilter) return;
    setActiveView('posts');
  }, [taxonomyFilter]);

  useEffect(() => {
    if (!taxonomyFilter || posts.data.length === 0) return;
    let active = true;
    const missingItems = posts.data.filter(
      (item) =>
        !Object.prototype.hasOwnProperty.call(postDetails, `${item.name}:${item.identifier}`),
    );
    if (missingItems.length === 0) return;

    void Promise.allSettled(
      missingItems.map(async (item) => ({
        key: `${item.name}:${item.identifier}`,
        post: await fetchBlogPost(item.name, item.identifier),
      })),
    ).then((results) => {
      if (!active) return;
      setPostDetails((current) => {
        const next = { ...current };
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            next[result.value.key] = result.value.post;
          } else {
            const item = missingItems[index];
            next[`${item.name}:${item.identifier}`] = null;
          }
        });
        return next;
      });
    });

    return () => {
      active = false;
    };
  }, [postDetails, posts.data, taxonomyFilter]);

  const getSortTimestamp = (item: BlogListItem) => item.updated ?? item.created ?? 0;

  const sortedPosts = useMemo(
    () =>
      [...posts.data]
        .filter((item) =>
          matchesTaxonomyFilter(postDetails[`${item.name}:${item.identifier}`], taxonomyFilter),
        )
        .sort((a, b) =>
          sortOrder === 'newest'
            ? getSortTimestamp(b) - getSortTimestamp(a)
            : getSortTimestamp(a) - getSortTimestamp(b),
        ),
    [postDetails, posts.data, sortOrder, taxonomyFilter],
  );

  const sortedBlogs = useMemo(
    () =>
      [...blogs.data].sort((a, b) =>
        sortOrder === 'newest'
          ? getSortTimestamp(b) - getSortTimestamp(a)
          : getSortTimestamp(a) - getSortTimestamp(b),
      ),
    [blogs.data, sortOrder],
  );

  return (
    <section className="page-stack">
      {blogs.status === 'error' ? <Notice tone="error" message={blogs.message} /> : null}

      <div className="home-control-row">
        <h2>{activeView === 'posts' ? t('home.recentPosts') : t('home.blogs')}</h2>
        <div className="segmented-control" role="tablist" aria-label="Home content">
          <button
            type="button"
            className={activeView === 'posts' ? 'active' : ''}
            onClick={() => setActiveView('posts')}
            role="tab"
            aria-selected={activeView === 'posts'}
          >
            {t('home.postsTab')}
          </button>
          <button
            type="button"
            className={activeView === 'blogs' ? 'active' : ''}
            onClick={() => setActiveView('blogs')}
            role="tab"
            aria-selected={activeView === 'blogs'}
          >
            {t('home.blogsTab')}
          </button>
        </div>
        <select
          className="sort-select"
          value={sortOrder}
          onChange={(event) => setSortOrder(event.target.value as SortOrder)}
          aria-label="Sort order"
        >
          <option value="newest">{t('sort.newest')}</option>
          <option value="oldest">{t('sort.oldest')}</option>
        </select>
      </div>

      {taxonomyFilter ? (
        <div className="active-filter-row">
          <span>
            {taxonomyFilter.type === 'category' ? t('filter.category') : t('filter.tag')}:{' '}
            <strong>{taxonomyFilter.value}</strong>
          </span>
          <button type="button" onClick={() => setSearchParams({})}>
            {t('filter.clear')}
          </button>
        </div>
      ) : null}

      {activeView === 'posts' ? (
        <section className="content-section">
          <div className="post-list">
            {sortedPosts.map((post) => (
              <PostListRow key={`${post.name}:${post.identifier}`} item={post} showAuthor />
            ))}
            {posts.status === 'ready' && sortedPosts.length === 0 ? (
              <Notice message={t('home.emptyPosts')} />
            ) : null}
          </div>
        </section>
      ) : (
        <section className="content-section">
          <div className="blog-grid">
            {sortedBlogs.map((item) => (
              <BlogListCard key={`${item.name}:${item.identifier}`} item={item} />
            ))}
            {blogs.status === 'ready' && blogs.data.length === 0 ? (
              <Notice message={t('home.emptyBlogs')} />
            ) : null}
          </div>
        </section>
      )}
    </section>
  );
}

function BlogPage() {
  const { t } = useAppLocale();
  const { name = '', blogId = '' } = useParams();
  const [account, setAccount] = useState<AccountProfile | null>(null);
  const [profile, setProfile] = useState<LoadState<BlogProfile | null>>({
    status: 'loading',
    data: null,
  });
  const [posts, setPosts] = useState<LoadState<BlogListItem[]>>({ status: 'loading', data: [] });

  useEffect(() => {
    const load = async () => {
      try {
        const [blogProfile, postItems] = await Promise.all([
          fetchBlogProfileReady(name, blogId),
          listPosts(blogId, 0, 30, name),
        ]);
        setProfile({ status: 'ready', data: blogProfile });
        setPosts({ status: 'ready', data: postItems });
      } catch (error) {
        const message = error instanceof Error ? error.message : t('error.loadBlog');
        setProfile({ status: 'error', data: null, message });
        setPosts({ status: 'error', data: [], message });
      }
    };
    void load();
  }, [name, blogId, t]);

  useEffect(() => {
    void getSelectedAccount()
      .then(setAccount)
      .catch(() => setAccount(null));
  }, []);

  if (profile.status === 'error') return <Notice tone="error" message={profile.message} />;

  const canEdit = Boolean(profile.data && account?.names.includes(profile.data.ownerName));

  return (
    <section className="page-stack">
      <div className="profile-band blog-profile-band">
        {profile.data?.cover ? (
          <QdnImage className="blog-banner" refData={profile.data.cover} alt="" />
        ) : (
          <div className="blog-banner blog-banner-empty">
            <Image size={28} />
          </div>
        )}
        <div className="blog-profile-content">
          <div>
            <p className="eyebrow">{name}</p>
            <h1>{profile.data?.title ?? blogId}</h1>
            <p>{profile.data?.description}</p>
            {profile.data ? (
              <SocialActions
                account={account}
                compact
                targetType="blog"
                ownerName={profile.data.ownerName}
                identifier={profile.data.blogId}
                title={profile.data.title}
                labels={socialLabels(t)}
                shareLink={buildBlogLink(profile.data.blogId, profile.data.ownerName ?? name)}
                showComments={false}
              />
            ) : null}
          </div>
          {canEdit ? (
            <Link className="command-button" to={`/blog/${name}/${blogId}/edit`}>
              <Edit3 size={18} />
              <span>{t('actions.editBlog')}</span>
            </Link>
          ) : null}
        </div>
      </div>

      <div className="post-list">
        {posts.data.map((post) => (
          <PostListRow key={`${post.name}:${post.identifier}`} item={post} />
        ))}
      </div>
    </section>
  );
}

function PostPage() {
  const { formatDate, t } = useAppLocale();
  const { name = '', postIdentifier = '' } = useParams();
  const parsed = useMemo(() => parsePostIdentifier(postIdentifier), [postIdentifier]);
  const [account, setAccount] = useState<AccountProfile | null>(null);
  const [post, setPost] = useState<LoadState<BlogPost | null>>({ status: 'loading', data: null });
  const [comments, setComments] = useState<Awaited<ReturnType<typeof listComments>>>([]);
  const [commentBody, setCommentBody] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const commentsRef = useRef<HTMLElement | null>(null);

  const load = useCallback(async () => {
    try {
      const loadedPost = await resolveBlogPostReady(name, postIdentifier);
      setPost({ status: 'ready', data: loadedPost });
      setComments(await listComments(loadedPost.postId));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('error.loadPost');
      setPost({ status: 'error', data: null, message });
    }
  }, [name, postIdentifier, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void getSelectedAccount()
      .then(setAccount)
      .catch(() => setAccount(null));
  }, []);

  const submitComment = async () => {
    if (!post.data || !commentBody.trim()) return;
    setIsSubmitting(true);
    try {
      const comment = await createComment({
        blogId: post.data.blogId,
        postId: post.data.postId,
        body: commentBody,
      });
      setComments((current) => [...current, comment]);
      setCommentBody('');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (post.status === 'error') return <Notice tone="error" message={post.message} />;

  const canEdit = Boolean(post.data && account?.names.includes(post.data.ownerName));

  return (
    <article className="article-view">
      <div className="article-header">
        <div className="article-title-row">
          <div>
            <p className="eyebrow">{name}</p>
            <h1>{post.data?.title ?? postIdentifier}</h1>
            <div className="meta-line">
              <span>{post.data ? formatDate(post.data.updatedAt) : ''}</span>
              <span>{parsed?.blogId}</span>
            </div>
            {post.data ? (
              <div className="taxonomy-link-row" aria-label="Post taxonomy">
                {post.data.category ? (
                  <Link
                    className="taxonomy-link"
                    to={getTaxonomyUrl('category', post.data.category)}
                  >
                    {post.data.category}
                  </Link>
                ) : null}
                {post.data.tags.map((tag) => (
                  <Link className="taxonomy-link" key={tag} to={getTaxonomyUrl('tag', tag)}>
                    #{tag}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
          {canEdit ? (
            <Link className="command-button" to={`/post/${name}/${postIdentifier}/edit`}>
              <Edit3 size={18} />
              <span>{t('actions.editPost')}</span>
            </Link>
          ) : null}
        </div>
      </div>

      <div className="article-body">
        {post.data?.blocks.map((block) =>
          block.type === 'text' ? (
            <RichTextContent key={block.id} value={block.content} />
          ) : (
            <div className="media-placeholder" key={block.id}>
              {block.type.toUpperCase()} {block.content.identifier}
            </div>
          ),
        )}
      </div>

      {post.data ? (
        <SocialActions
          account={account}
          targetType="post"
          ownerName={post.data.ownerName}
          identifier={postIdentifier}
          title={post.data.title}
          labels={socialLabels(t)}
          shareLink={buildPostLink(postIdentifier, post.data?.ownerName ?? name)}
          commentsCount={comments.length}
          onComments={() =>
            commentsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        />
      ) : null}

      <section className="comments" ref={commentsRef}>
        <h2>{t('comments.title')}</h2>
        <div className="comment-list">
          {comments.map((comment) => (
            <div className="comment-card" key={comment.commentId}>
              <div className="meta-line">
                <strong>{comment.authorName}</strong>
                <span>{formatDate(comment.createdAt)}</span>
              </div>
              <p>{comment.body}</p>
            </div>
          ))}
        </div>
        <div className="comment-editor">
          <textarea
            value={commentBody}
            onChange={(event) => setCommentBody(event.target.value)}
            placeholder={t('comments.placeholder')}
          />
          <button type="button" onClick={() => void submitComment()} disabled={isSubmitting}>
            {t('actions.publishComment')}
          </button>
        </div>
      </section>
    </article>
  );
}

function TaxonomyTextInput({
  value,
  suggestions,
  placeholder,
  onChange,
}: {
  value: string;
  suggestions: string[];
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const matches = useMemo(() => {
    const query = normalizeTaxonomyValue(value).toLowerCase();
    if (!query) return suggestions.slice(0, 8);
    return suggestions.filter((suggestion) => suggestion.toLowerCase().includes(query)).slice(0, 8);
  }, [suggestions, value]);

  return (
    <div className="taxonomy-field">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {matches.length > 0 ? (
        <div className="taxonomy-suggestions">
          {matches.map((suggestion) => (
            <button type="button" key={suggestion} onClick={() => onChange(suggestion)}>
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const getTagInputState = (value: string) => {
  const parts = value.split(',');
  const rawToken = parts.at(-1) ?? '';
  const token = normalizeTaxonomyValue(rawToken);
  const prefix = parts.slice(0, -1).join(',').trim();
  const selected = new Set(
    parts
      .slice(0, -1)
      .map((part) => normalizeTaxonomyValue(part).toLowerCase())
      .filter(Boolean),
  );
  return { prefix, selected, token };
};

function TaxonomyTagInput({
  value,
  suggestions,
  placeholder,
  onChange,
}: {
  value: string;
  suggestions: string[];
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const { prefix, selected, token } = useMemo(() => getTagInputState(value), [value]);
  const matches = useMemo(() => {
    const query = token.toLowerCase();
    return suggestions
      .filter((suggestion) => !selected.has(suggestion.toLowerCase()))
      .filter((suggestion) => !query || suggestion.toLowerCase().includes(query))
      .slice(0, 8);
  }, [selected, suggestions, token]);

  const applySuggestion = (suggestion: string) => {
    onChange(prefix ? `${prefix}, ${suggestion}` : suggestion);
  };

  return (
    <div className="taxonomy-field">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {matches.length > 0 ? (
        <div className="taxonomy-suggestions">
          {matches.map((suggestion) => (
            <button type="button" key={suggestion} onClick={() => applySuggestion(suggestion)}>
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CreateBlogPage() {
  const { t } = useAppLocale();
  const navigate = useNavigate();
  const taxonomy = useTaxonomySuggestions();
  const [account, setAccount] = useState<AccountProfile | null>(null);
  const [ownerName, setOwnerName] = useState('');
  const [handle, setHandle] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const selectedAccount = await getSelectedAccount();
        setAccount(selectedAccount);
        setOwnerName(selectedAccount.name);
        if (selectedAccount.names.length === 0) {
          setMessage(t('error.noNames'));
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t('error.publishInHome'));
      }
    };
    void load();
  }, [t]);

  const submit = async () => {
    setIsSubmitting(true);
    setMessage('');
    try {
      const avatar = avatarFile ? await publishBlogImage(avatarFile, ownerName) : undefined;
      const cover = coverFile ? await publishBlogImage(coverFile, ownerName) : undefined;
      const blog = await createBlog({
        ownerName,
        handle,
        title,
        description,
        tags: getCanonicalTags(tags, taxonomy.tags),
        avatar,
        cover,
      });
      navigate(`/blog/${blog.ownerName}/${blog.blogId}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('error.createBlog'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormPanel title={t('form.createBlog')} message={message}>
      <label>
        {t('form.publishingName')}
        <select value={ownerName} onChange={(event) => setOwnerName(event.target.value)}>
          {(account?.names ?? []).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('form.blogHandle')}
        <input
          value={handle}
          onChange={(event) => setHandle(event.target.value)}
          placeholder={t('placeholder.blogHandle')}
        />
      </label>
      <label>
        {t('form.title')}
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t('placeholder.blogTitle')}
        />
      </label>
      <label>
        {t('form.description')}
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <ImageFileField label={t('form.blogCoverImage')} file={avatarFile} onChange={setAvatarFile} />
      <ImageFileField label={t('form.blogBannerImage')} file={coverFile} onChange={setCoverFile} />
      <label>
        {t('form.tags')}
        <TaxonomyTagInput
          value={tags}
          suggestions={taxonomy.tags}
          placeholder={t('placeholder.blogTags')}
          onChange={setTags}
        />
      </label>
      <button type="button" onClick={() => void submit()} disabled={isSubmitting}>
        {t('actions.publishBlog')}
      </button>
    </FormPanel>
  );
}

function EditBlogPage() {
  const { t } = useAppLocale();
  const navigate = useNavigate();
  const { name = '', blogId = '' } = useParams();
  const taxonomy = useTaxonomySuggestions();
  const [profile, setProfile] = useState<BlogProfile | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [selectedAccount, loadedProfile] = await Promise.all([
          getSelectedAccount(),
          fetchBlogProfile(name, blogId),
        ]);
        if (!selectedAccount.names.includes(loadedProfile.ownerName)) {
          setMessage(t('error.editBlogOwner'));
          return;
        }
        setProfile(loadedProfile);
        setTitle(loadedProfile.title);
        setDescription(loadedProfile.description);
        setTags(loadedProfile.tags.join(', '));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t('error.loadBlog'));
      }
    };
    void load();
  }, [blogId, name, t]);

  const submit = async () => {
    if (!profile) return;
    setIsSubmitting(true);
    setMessage('');
    try {
      const avatar = avatarFile
        ? await publishBlogImage(avatarFile, profile.ownerName)
        : profile.avatar;
      const cover = coverFile
        ? await publishBlogImage(coverFile, profile.ownerName)
        : profile.cover;
      const updated = await updateBlog({
        profile,
        title,
        description,
        tags: getCanonicalTags(tags, taxonomy.tags),
        avatar,
        cover,
      });
      navigate(`/blog/${updated.ownerName}/${updated.blogId}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('error.updateBlog'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormPanel title={t('form.editBlog')} message={message}>
      <label>
        {t('form.blogHandle')}
        <input value={profile?.blogId ?? blogId} disabled />
      </label>
      <label>
        {t('form.title')}
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label>
        {t('form.description')}
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <ImageFileField
        label={t('form.blogCoverImage')}
        file={avatarFile}
        currentRef={profile?.avatar}
        onChange={setAvatarFile}
      />
      <ImageFileField
        label={t('form.blogBannerImage')}
        file={coverFile}
        currentRef={profile?.cover}
        onChange={setCoverFile}
      />
      <label>
        {t('form.tags')}
        <TaxonomyTagInput
          value={tags}
          suggestions={taxonomy.tags}
          placeholder={t('placeholder.blogTags')}
          onChange={setTags}
        />
      </label>
      <button type="button" onClick={() => void submit()} disabled={isSubmitting || !profile}>
        {t('actions.saveBlog')}
      </button>
    </FormPanel>
  );
}

function CreatePostPage() {
  const { t } = useAppLocale();
  const navigate = useNavigate();
  const taxonomy = useTaxonomySuggestions();
  const [blogs, setBlogs] = useState<BlogProfile[]>([]);
  const [selected, setSelected] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [pendingMedia, setPendingMedia] = useState<PendingBlogMedia[]>([]);
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const account = await getSelectedAccount();
        if (account.names.length === 0) {
          setMessage(t('error.noNames'));
          return;
        }
        const items = await listBlogsForNames(account.names);
        const profiles = await Promise.all(
          items.map((item) => fetchBlogProfile(item.name, item.identifier)),
        );
        const ownedProfiles = profiles.filter((profile) =>
          account.names.includes(profile.ownerName),
        );
        setBlogs(ownedProfiles);
        setSelected(
          ownedProfiles[0] ? `${ownedProfiles[0].ownerName}::${ownedProfiles[0].blogId}` : '',
        );
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t('error.publishInHome'));
      }
    };
    void load();
  }, [t]);

  const submit = async () => {
    const blog = blogs.find((item) => `${item.ownerName}::${item.blogId}` === selected);
    if (!blog) {
      setMessage(t('error.selectBlog'));
      return;
    }
    setIsSubmitting(true);
    setMessage('');
    try {
      const result = await createPost({
        blog,
        title,
        body,
        category: getCanonicalTaxonomyValue(category, taxonomy.categories),
        tags: getCanonicalTags(tags, taxonomy.tags),
        pendingMedia,
      });
      navigate(`/post/${result.post.ownerName}/${result.identifier}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('error.publishPost'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedBlog = blogs.find((item) => `${item.ownerName}::${item.blogId}` === selected);

  return (
    <FormPanel
      title={t('form.createPost')}
      message={message}
      closeLabel={t('actions.cancel')}
      onClose={() => navigate('/')}
    >
      <label>
        {t('form.blog')}
        <select value={selected} onChange={(event) => setSelected(event.target.value)}>
          {blogs.map((blog) => (
            <option
              key={`${blog.ownerName}:${blog.blogId}`}
              value={`${blog.ownerName}::${blog.blogId}`}
            >
              {blog.title} ({blog.ownerName})
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('form.title')}
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <div className="form-field">
        <span>{t('form.body')}</span>
        <RichTextEditor
          value={body}
          ownerName={selectedBlog?.ownerName ?? ''}
          disabled={isSubmitting}
          placeholder={t('placeholder.postBody')}
          onMediaQueued={(media) => setPendingMedia((current) => mergePendingMedia(current, media))}
          onChange={setBody}
        />
      </div>
      <label>
        {t('form.category')}
        <TaxonomyTextInput
          value={category}
          suggestions={taxonomy.categories}
          onChange={setCategory}
        />
      </label>
      <label>
        {t('form.tags')}
        <TaxonomyTagInput
          value={tags}
          suggestions={taxonomy.tags}
          placeholder={t('placeholder.postTags')}
          onChange={setTags}
        />
      </label>
      <div className="form-actions">
        <button type="button" onClick={() => void submit()} disabled={isSubmitting}>
          {t('actions.publishPost')}
        </button>
        <button type="button" className="secondary-button" onClick={() => navigate('/')}>
          {t('actions.cancel')}
        </button>
      </div>
    </FormPanel>
  );
}

const getPostBody = (post: BlogPost) =>
  post.blocks
    .filter((block) => block.type === 'text')
    .map((block) => block.content)
    .join('\n\n');

function EditPostPage() {
  const { t } = useAppLocale();
  const navigate = useNavigate();
  const { name = '', postIdentifier = '' } = useParams();
  const taxonomy = useTaxonomySuggestions();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [pendingMedia, setPendingMedia] = useState<PendingBlogMedia[]>([]);
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [selectedAccount, loadedPost] = await Promise.all([
          getSelectedAccount(),
          resolveBlogPost(name, postIdentifier),
        ]);
        if (!selectedAccount.names.includes(loadedPost.ownerName)) {
          setMessage(t('error.editPostOwner'));
          return;
        }
        setPost(loadedPost);
        setTitle(loadedPost.title);
        setBody(getPostBody(loadedPost));
        setCategory(loadedPost.category);
        setTags(loadedPost.tags.join(', '));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t('error.loadPost'));
      }
    };
    void load();
  }, [name, postIdentifier, t]);

  const submit = async () => {
    if (!post) return;
    setIsSubmitting(true);
    setMessage('');
    try {
      const result = await updatePost({
        post,
        title,
        body,
        category: getCanonicalTaxonomyValue(category, taxonomy.categories),
        tags: getCanonicalTags(tags, taxonomy.tags),
        pendingMedia,
      });
      navigate(`/post/${result.post.ownerName}/${result.identifier}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('error.updatePost'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormPanel title={t('form.editPost')} message={message}>
      <label>
        {t('form.blog')}
        <input value={post?.blogId ?? ''} disabled />
      </label>
      <label>
        {t('form.title')}
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <div className="form-field">
        <span>{t('form.body')}</span>
        <RichTextEditor
          value={body}
          ownerName={post?.ownerName ?? ''}
          disabled={isSubmitting || !post}
          placeholder={t('placeholder.postBody')}
          onMediaQueued={(media) => setPendingMedia((current) => mergePendingMedia(current, media))}
          onChange={setBody}
        />
      </div>
      <label>
        {t('form.category')}
        <TaxonomyTextInput
          value={category}
          suggestions={taxonomy.categories}
          onChange={setCategory}
        />
      </label>
      <label>
        {t('form.tags')}
        <TaxonomyTagInput
          value={tags}
          suggestions={taxonomy.tags}
          placeholder={t('placeholder.postTags')}
          onChange={setTags}
        />
      </label>
      <button type="button" onClick={() => void submit()} disabled={isSubmitting || !post}>
        {t('actions.savePost')}
      </button>
    </FormPanel>
  );
}

function FormPanel({
  title,
  message,
  closeLabel,
  onClose,
  children,
}: {
  title: string;
  message: string;
  closeLabel?: string;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="form-panel">
      <div className="form-panel-header">
        <h1>{title}</h1>
        {onClose ? (
          <button type="button" className="icon-button" onClick={onClose} aria-label={closeLabel}>
            <X size={18} />
          </button>
        ) : null}
      </div>
      {message ? <Notice tone="error" message={message} /> : null}
      <div className="form-grid">{children}</div>
    </section>
  );
}

function QdnImage({
  refData,
  alt,
  className,
  fallbackSrc,
}: {
  refData: QdnResourceRef;
  alt: string;
  className: string;
  fallbackSrc?: string;
}) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    let active = true;
    void getQdnResourceUrl(refData)
      .then((resourceUrl) => {
        if (active) setUrl(resourceUrl);
      })
      .catch(() => {
        if (active) setUrl(fallbackSrc ?? '');
      });
    return () => {
      active = false;
    };
  }, [fallbackSrc, refData]);

  if (!url) return <div className={`${className} image-loading`} />;
  return (
    <img
      className={className}
      src={url}
      alt={alt}
      onError={() => {
        if (fallbackSrc && url !== fallbackSrc) setUrl(fallbackSrc);
      }}
    />
  );
}

function BlogListCard({ item }: { item: BlogListItem }) {
  const { account, t } = useAppLocale();
  const [profile, setProfile] = useState<BlogProfile | null>(null);

  useEffect(() => {
    let active = true;
    void fetchBlogProfile(item.name, item.identifier)
      .then((loadedProfile) => {
        if (active) setProfile(loadedProfile);
      })
      .catch(() => {
        if (active) setProfile(null);
      });
    return () => {
      active = false;
    };
  }, [item.identifier, item.name]);

  const title =
    profile?.title || (item.title && item.title !== item.identifier ? item.title : item.name);
  const description = profile?.description || item.description || '';
  const coverRef = profile?.avatar ?? profile?.cover;

  return (
    <article className="blog-card">
      <Link className="card-main-link" to={`/blog/${item.name}/${item.identifier}`}>
        {coverRef ? (
          <QdnImage
            className="blog-card-cover"
            refData={coverRef}
            alt=""
            fallbackSrc={defaultBlogCover}
          />
        ) : (
          <img className="blog-card-cover" src={defaultBlogCover} alt="" />
        )}
        <h3>{title}</h3>
        <p>{description}</p>
        <div className="meta-line">
          <span>{item.name}</span>
        </div>
      </Link>
      <SocialActions
        account={account}
        compact
        targetType="blog"
        ownerName={profile?.ownerName ?? item.name}
        identifier={profile?.blogId ?? item.identifier}
        title={title}
        labels={socialLabels(t)}
        shareLink={buildBlogLink(item.identifier, profile?.ownerName ?? item.name)}
        showComments={false}
      />
    </article>
  );
}

function PostListRow({ item, showAuthor = false }: { item: BlogListItem; showAuthor?: boolean }) {
  const { account, formatDate, t } = useAppLocale();
  const navigate = useNavigate();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [profile, setProfile] = useState<BlogProfile | null>(null);

  useEffect(() => {
    let active = true;
    void fetchBlogPost(item.name, item.identifier)
      .then((loadedPost) => {
        if (active) setPost(loadedPost);
      })
      .catch(() => {
        if (active) setPost(null);
      });
    return () => {
      active = false;
    };
  }, [item.identifier, item.name]);

  useEffect(() => {
    if (!post?.blogId) {
      setProfile(null);
      return;
    }

    let active = true;
    void fetchBlogProfile(item.name, post.blogId)
      .then((loadedProfile) => {
        if (active) setProfile(loadedProfile);
      })
      .catch(() => {
        if (active) setProfile(null);
      });
    return () => {
      active = false;
    };
  }, [item.name, post?.blogId]);

  const title =
    post?.title || (item.title && item.title !== item.identifier ? item.title : 'Loading post...');
  const description = post?.excerpt || item.description || '';
  const imageRef = post ? findFirstQdnImageRef(getPostBody(post)) : null;
  const fallbackRef = profile?.avatar ?? profile?.cover;

  return (
    <article className="post-row">
      <Link className="card-main-link" to={`/post/${item.name}/${item.identifier}`}>
        {imageRef ? (
          <QdnImage
            className="post-card-cover"
            refData={imageRef}
            alt=""
            fallbackSrc={defaultPostCover}
          />
        ) : fallbackRef ? (
          <QdnImage
            className="post-card-cover"
            refData={fallbackRef}
            alt=""
            fallbackSrc={defaultPostCover}
          />
        ) : (
          <img className="post-card-cover" src={defaultPostCover} alt="" />
        )}
        <div className="post-card-content">
          <h3>{title}</h3>
          <p>{description}</p>
          <div className="meta-line">
            {showAuthor ? <span>{item.name}</span> : null}
            <span>{formatDate(item.updated ?? item.created)}</span>
            {!showAuthor ? <span>{item.name}</span> : null}
          </div>
        </div>
      </Link>
      <SocialActions
        account={account}
        compact
        targetType="post"
        ownerName={post?.ownerName ?? item.name}
        identifier={item.identifier}
        title={title}
        labels={socialLabels(t)}
        shareLink={buildPostLink(item.identifier, post?.ownerName ?? item.name)}
        onComments={() => navigate(`/post/${item.name}/${item.identifier}`)}
      />
    </article>
  );
}

function ImageFileField({
  label,
  file,
  currentRef,
  onChange,
}: {
  label: string;
  file: File | null;
  currentRef?: QdnResourceRef;
  onChange: (file: File | null) => void;
}) {
  return (
    <label>
      {label}
      {currentRef ? <QdnImage className="image-field-preview" refData={currentRef} alt="" /> : null}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
      <span className="field-hint">{file ? file.name : 'Leave empty to keep current image.'}</span>
    </label>
  );
}

function Notice({ message, tone = 'neutral' }: { message: string; tone?: 'neutral' | 'error' }) {
  return <div className={`notice notice-${tone}`}>{message}</div>;
}

export function App() {
  const navigate = useNavigate();
  const [account, setAccount] = useState<AccountProfile | null>(null);
  const [displaySettings, setDisplaySettings] = useState(getInitialDisplaySettings);
  const t = useMemo(() => createTranslator(displaySettings.language), [displaySettings.language]);
  const formatDate = useCallback(
    (value?: number) => {
      if (!value) return '';
      return new Intl.DateTimeFormat(displaySettings.language, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(value);
    },
    [displaySettings.language],
  );
  const localeContext = useMemo(
    () => ({ account, displaySettings, formatDate, t }),
    [account, displaySettings, formatDate, t],
  );

  const toggleTheme = useCallback(() => {
    setDisplaySettings((current) => {
      const next = current.theme === 'light' ? 'dark' : 'light';
      persistTheme(next);
      return { ...current, theme: next };
    });
  }, []);

  useEffect(() => {
    const deepLink = getInitialDeepLink();
    if (deepLink.postIdentifier) {
      const name = deepLink.publisherName || '_';
      navigate(`/post/${name}/${deepLink.postIdentifier}`, { replace: true });
    }
    if (deepLink.blogId) {
      if (deepLink.publisherName) {
        navigate(`/blog/${deepLink.publisherName}/${deepLink.blogId}`, { replace: true });
      } else {
        // Legacy link without publisher — search all publishers.
        // An identifier-only blog link is inherently ambiguous when
        // multiple publishers share the same blogId.  Canonical
        // publisher-aware links (&name=) are preferred.
        void listBlogs()
          .then((items) => items.find((item) => item.identifier === deepLink.blogId))
          .then((item) => {
            if (item) navigate(`/blog/${item.name}/${item.identifier}`, { replace: true });
          })
          .catch(() => undefined);
      }
    }
  }, [navigate]);

  useEffect(() => {
    if (!hasQortiumBridge()) return;
    void getSelectedAccount()
      .then(setAccount)
      .catch(() => setAccount(null));
  }, []);

  useEffect(() => {
    applyDisplaySettings(displaySettings);
  }, [displaySettings]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const action =
        typeof event.data === 'object' && event.data !== null && 'action' in event.data
          ? event.data.action
          : '';
      if (
        action !== 'LANGUAGE_CHANGED' &&
        action !== 'DISPLAY_SETTINGS_CHANGED' &&
        action !== 'QDN_DISPLAY_SETTINGS_CHANGED'
      ) {
        return;
      }
      setDisplaySettings(
        (current) => getDisplaySettingsUpdateFromMessage(event.data, current) ?? current,
      );
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <AppLocaleContext.Provider value={localeContext}>
      <Shell account={account} onToggleTheme={toggleTheme} />
    </AppLocaleContext.Provider>
  );
}
