export const SUPPORTED_LANGUAGES = [
  'ar',
  'de',
  'el',
  'en',
  'es',
  'et',
  'fi',
  'fr',
  'he',
  'hi',
  'hu',
  'it',
  'ja',
  'ko',
  'nb',
  'nl',
  'pl',
  'pt',
  'ro',
  'ru',
  'sv',
  'zh-CN',
  'zh-TW',
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const SUPPORTED_LANGUAGE_SET = new Set<string>(SUPPORTED_LANGUAGES);
const RTL_LANGUAGES = new Set<string>(['ar', 'he']);
const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

const EN_STRINGS = {
  'app.name': 'Qortium Blog',
  'nav.home': 'Home',
  'nav.myBlog': 'My Blog',
  'nav.newBlog': 'New Blog',
  'nav.newPost': 'New Post',
  'account.guest': 'Guest',
  'home.title': 'Blogs on Qortium',
  'home.recentPosts': 'Recent Posts',
  'home.blogs': 'Blogs',
  'home.postsTab': 'Posts',
  'home.blogsTab': 'Blogs',
  'sort.newest': 'Newest',
  'sort.oldest': 'Oldest',
  'filter.category': 'Category',
  'filter.tag': 'Tag',
  'filter.clear': 'Clear',
  'search.placeholder': 'Search blogs and posts',
  'search.loading': 'Searching...',
  'search.empty': 'No matching results.',
  'search.blog': 'Blog',
  'search.post': 'Post',
  'social.like': 'Like',
  'social.share': 'Share link',
  'social.comments': 'Comments',
  'social.copied': 'Copied',
  'home.emptyPosts': 'No blog posts have been published yet.',
  'home.emptyBlogs': 'No blogs have been created yet.',
  'actions.refresh': 'Refresh',
  'actions.publishBlog': 'Publish Blog',
  'actions.publishPost': 'Publish Post',
  'actions.publishComment': 'Publish Comment',
  'actions.editBlog': 'Edit Blog',
  'actions.saveBlog': 'Save Blog',
  'actions.editPost': 'Edit Post',
  'actions.savePost': 'Save Post',
  'actions.cancel': 'Cancel',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'theme.toggle': 'Toggle theme',
  'comments.title': 'Comments',
  'comments.placeholder': 'Write a comment',
  'form.createBlog': 'Create Blog',
  'form.editBlog': 'Edit Blog',
  'form.createPost': 'Create Post',
  'form.editPost': 'Edit Post',
  'form.blogHandle': 'Blog Handle',
  'form.publishingName': 'Publishing Name',
  'form.blog': 'Blog',
  'form.title': 'Title',
  'form.description': 'Description',
  'form.blogCoverImage': 'Blog Cover Image',
  'form.blogBannerImage': 'Blog Banner Image',
  'form.body': 'Body',
  'form.category': 'Category',
  'form.tags': 'Tags',
  'placeholder.blogHandle': 'my-blog',
  'placeholder.blogTitle': 'My Blog',
  'placeholder.blogTags': 'qdn, tech',
  'placeholder.postBody': 'Write your post...',
  'placeholder.postTags': 'tag1, tag2',
  'error.loadQdnResources': 'Unable to load QDN resources.',
  'error.loadBlog': 'Unable to load this blog.',
  'error.loadPost': 'Unable to load this post.',
  'error.createBlog': 'Unable to create blog.',
  'error.updateBlog': 'Unable to update blog.',
  'error.editBlogOwner': 'Only the blog owner can edit this blog.',
  'error.publishPost': 'Unable to publish post.',
  'error.updatePost': 'Unable to update post.',
  'error.editPostOwner': 'Only the post owner can edit this post.',
  'error.publishInHome': 'Open this app inside Qortium Home to publish.',
  'error.selectBlog': 'Create or select a blog first.',
  'error.noNames': 'This account has no registered Qortium names.',
} as const;

type TranslationKey = keyof typeof EN_STRINGS;
type Catalog = Partial<Record<TranslationKey, string>>;

const ET_STRINGS: Catalog = {
  'nav.home': 'Avaleht',
  'nav.myBlog': 'Minu blogi',
  'nav.newBlog': 'Uus blogi',
  'nav.newPost': 'Uus postitus',
  'account.guest': 'Külaline',
  'home.title': 'Blogid Qortiumis',
  'home.recentPosts': 'Viimased postitused',
  'home.blogs': 'Blogid',
  'home.postsTab': 'Postitused',
  'home.blogsTab': 'Blogid',
  'sort.newest': 'Uusimad',
  'sort.oldest': 'Vanimad',
  'filter.category': 'Kategooria',
  'filter.tag': 'Silt',
  'filter.clear': 'Eemalda',
  'search.placeholder': 'Otsi blogidest ja postitustest',
  'search.loading': 'Otsin...',
  'search.empty': 'Sobivaid tulemusi ei leitud.',
  'search.blog': 'Blogi',
  'search.post': 'Postitus',
  'social.like': 'Meeldib',
  'social.share': 'Jaga linki',
  'social.comments': 'Kommentaarid',
  'social.copied': 'Kopeeritud',
  'home.emptyPosts': 'Ühtegi blogipostitust pole veel avaldatud.',
  'home.emptyBlogs': 'Ühtegi blogi pole veel loodud.',
  'actions.refresh': 'Värskenda',
  'actions.publishBlog': 'Avalda blogi',
  'actions.publishPost': 'Avalda postitus',
  'actions.publishComment': 'Avalda kommentaar',
  'actions.editBlog': 'Muuda blogi',
  'actions.saveBlog': 'Salvesta blogi',
  'actions.editPost': 'Muuda postitust',
  'actions.savePost': 'Salvesta postitus',
  'actions.cancel': 'Tühista',
  'theme.light': 'Hele',
  'theme.dark': 'Tume',
  'theme.toggle': 'Vaheta kujundust',
  'comments.title': 'Kommentaarid',
  'comments.placeholder': 'Kirjuta kommentaar',
  'form.createBlog': 'Loo blogi',
  'form.editBlog': 'Muuda blogi',
  'form.createPost': 'Loo postitus',
  'form.editPost': 'Muuda postitust',
  'form.blogHandle': 'Blogi tunnus',
  'form.publishingName': 'Avaldamise nimi',
  'form.blog': 'Blogi',
  'form.title': 'Pealkiri',
  'form.description': 'Kirjeldus',
  'form.blogCoverImage': 'Blogi kaanepilt',
  'form.blogBannerImage': 'Blogi bannerpilt',
  'form.body': 'Sisu',
  'form.category': 'Kategooria',
  'form.tags': 'Sildid',
  'placeholder.postBody': 'Kirjuta postitus...',
  'error.loadQdnResources': 'QDN ressursse ei saanud laadida.',
  'error.loadBlog': 'Seda blogi ei saanud laadida.',
  'error.loadPost': 'Seda postitust ei saanud laadida.',
  'error.createBlog': 'Blogi loomine ebaõnnestus.',
  'error.updateBlog': 'Blogi uuendamine ebaõnnestus.',
  'error.editBlogOwner': 'Ainult blogi omanik saab seda blogi muuta.',
  'error.publishPost': 'Postituse avaldamine ebaõnnestus.',
  'error.updatePost': 'Postituse uuendamine ebaõnnestus.',
  'error.editPostOwner': 'Ainult postituse omanik saab seda postitust muuta.',
  'error.publishInHome': 'Avaldamiseks ava see äpp Qortium Home’is.',
  'error.selectBlog': 'Loo või vali esmalt blogi.',
  'error.noNames': 'Sellel kontol ei ole registreeritud Qortiumi nimesid.',
};

const CATALOGS: Partial<Record<SupportedLanguage, Catalog>> = {
  en: EN_STRINGS,
  et: ET_STRINGS,
};

const normalizeRawLanguage = (language: string) => language.trim().replace(/_/g, '-').toLowerCase();

const mapRawLanguage = (language: string): SupportedLanguage | null => {
  const normalized = normalizeRawLanguage(language);
  const exact = SUPPORTED_LANGUAGES.find((item) => item.toLowerCase() === normalized);
  if (exact) return exact;

  const primary = normalized.split('-')[0];
  if (SUPPORTED_LANGUAGE_SET.has(primary)) return primary as SupportedLanguage;

  if (normalized === 'zh-cn' || normalized === 'zh-hans') return 'zh-CN';
  if (normalized === 'zh-tw' || normalized === 'zh-hant') return 'zh-TW';

  return null;
};

export const normalizeLanguage = (language: unknown): SupportedLanguage | null =>
  typeof language === 'string' && language.trim() ? mapRawLanguage(language) : null;

export const isRtlLanguage = (language: SupportedLanguage) => RTL_LANGUAGES.has(language);

export const createTranslator = (language: SupportedLanguage) => {
  const catalog = CATALOGS[language] ?? {};
  return (key: TranslationKey) => catalog[key] ?? EN_STRINGS[key];
};

export const getDefaultLanguage = () => DEFAULT_LANGUAGE;
