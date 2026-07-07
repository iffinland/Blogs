export type QdnService =
  'BLOG' | 'BLOG_POST' | 'BLOG_COMMENT' | 'DOCUMENT' | 'IMAGE' | 'VIDEO' | 'FILE';

export type QdnResourceRef = {
  service: QdnService;
  name: string;
  identifier: string;
  filename?: string;
  mimeType?: string;
  size?: number;
};

export type BlogSettings = {
  allowComments: boolean;
  allowTips: boolean;
  listed: boolean;
};

export type BlogProfile = {
  schema: 'qortium.blog.profile.v1';
  version: 1;
  blogId: string;
  ownerName: string;
  title: string;
  description: string;
  avatar?: QdnResourceRef;
  cover?: QdnResourceRef;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  settings: BlogSettings;
};

export type PostBlock =
  | {
      id: string;
      type: 'text';
      version: 1;
      content: string;
    }
  | {
      id: string;
      type: 'image' | 'video' | 'file';
      version: 1;
      content: QdnResourceRef & { caption?: string };
    };

export type BlogPost = {
  schema: 'qortium.blog.post.v1';
  version: 1;
  blogId: string;
  postId: string;
  ownerName: string;
  title: string;
  excerpt: string;
  category: string;
  tags: string[];
  blocks: PostBlock[];
  cover?: QdnResourceRef;
  createdAt: number;
  updatedAt: number;
  status: 'published' | 'deleted';
};

export type BlogComment = {
  schema: 'qortium.blog.comment.v1';
  version: 1;
  blogId: string;
  postId: string;
  commentId: string;
  authorName: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  status: 'published' | 'deleted';
};

export type BlogLikeTargetType = 'blog' | 'post';

export type BlogLike = {
  schema: 'qortium.blog.like.v1';
  version: 1;
  targetType: BlogLikeTargetType;
  targetOwnerName: string;
  targetIdentifier: string;
  authorName: string;
  authorAddress: string;
  createdAt: number;
};

export type BlogListItem = {
  name: string;
  identifier: string;
  title: string;
  description: string;
  category?: string;
  tags: string[];
  created?: number;
  updated?: number;
};

export type AccountProfile = {
  address: string;
  name: string;
  names: string[];
  raw: unknown;
};
