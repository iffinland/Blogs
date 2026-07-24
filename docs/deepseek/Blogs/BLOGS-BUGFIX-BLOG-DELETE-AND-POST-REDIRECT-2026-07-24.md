# Blogs — Post-Delete Redirect Fix + Blog Deletion

**Date:** 2026-07-24
**Branch:** Working tree (uncommitted)
**Baseline:** `72ae5cd1647d9cb5b770939beaef4c29cb315d60`

---

## PART A — Post-Delete Redirect Fix

### Root Cause

`buildBlogLink()` in `src/services/blog/deepLinks.ts` returns a **deep-link/share URL** of the form:

```
qdn://APP/Blog/Blog?blog=my-blog&name=Alice
```

This is not a React Router route. When passed to `navigate()`, React Router cannot match it to `<Route path="/blog/:name/:blogId">`, so the user lands on a dead/empty page.

### Corrected Navigation Target

**Before (broken):**
```ts
navigate(buildBlogLink(post.data.blogId, post.data.ownerName), { replace: true });
```

**After (fixed):**
```ts
navigate(`/blog/${post.data.ownerName}/${post.data.blogId}`, { replace: true });
```

This produces the canonical React Router route `/blog/Alice/my-blog`, which matches `<Route path="/blog/:name/:blogId" element={<BlogPage />} />`.

The `replace: true` option is preserved — browser Back does not return to the deleted post.

---

## PART B — Blog Deletion

### Delete Contract

Same `DELETE_QDN_RESOURCE` action already verified for posts.

**Canonical target:** `(service="BLOG", name=ownerName, identifier=blogId)`

Path: `POST /arbitrary/resource/BLOG/{name}/{blogId}/delete`

### BLOG/POST Cascade Semantics

**Deleting a BLOG resource does NOT cascade to BLOG_POST resources.**

Investigation of `github-clones/qortium-home/src/platform.ts` (`deleteQdnResourceForApp`, `buildQdnDeletePath`):

- The delete endpoint path is `/arbitrary/resource/{service}/{name}/{identifier}/delete`
- It targets exactly one resource identified by `(service, name, identifier)`
- There is no cascade, no bulk-delete, no enumeration of related resources
- `BLOG_POST` resources have service `BLOG_POST`, not `BLOG` — they are entirely independent

This is confirmed architecturally:
- `BLOG` and `BLOG_POST` are different QDN services
- Post identifiers (`p.{blogId}.{postId}`) share a prefix convention with blog IDs but are not linked at the resource level
- Each post is published, searched, fetched, and deleted independently

### Orphan-Content Safety Policy

**Policy: Block blog deletion when posts exist.**

Before opening the delete confirmation, `countPostsInBlog(blogId, ownerName)` checks how many posts exist in the blog.

- If `count > 0`: The confirmation dialog shows a warning explaining that posts are independent QDN resources and will not be deleted. The "Delete blog" button is **disabled**.
- If `count === 0`: The confirmation dialog shows the standard warning and allows deletion.

The user must manually delete each post (using the existing post-delete feature) before deleting the blog. This prevents orphaned `BLOG_POST` resources with no parent `BLOG` profile.

---

## Files Changed

| File | Change |
|------|--------|
| `src/App.tsx` | Fixed post-delete navigation; added blog delete UI (button, modal, orphan check, navigate-to-home) |
| `src/services/blog/blogService.ts` | Added `deleteBlog(ownerName, blogId)`, `countPostsInBlog(blogId, ownerName)` |
| `src/i18n.ts` | Added EN+ET translations: `actions.deleteBlog`, `form.deleteBlogTitle/Warning/HasPosts/Confirm`, `error.deleteBlog`; added interpolation support to `createTranslator` |
| `src/services/qdn/post-delete.test.ts` | +7 tests: D8 (redirect target), B1-B6 (blog delete contract, ownership, no-cascade, failure) |

### No changes to:
- Comments, likes, image recovery, link handling
- `RichTextContent.tsx`, `deepLinks.ts`, `richText.ts`, `mediaService.ts`
- Post-delete confirmation modal (reused from previous feature)
- CSS (modal/button styles already added in previous feature)

---

## Tests

### Post redirect regression (D8)
- Verifies canonical route is `/blog/{name}/{blogId}`
- Verifies it does NOT contain `qdn://`, `?blog=`, or `&name=`

### Blog deletion (B1-B6)
| Test | Description |
|------|-------------|
| B1 | Deletes with canonical `(BLOG, ownerName, blogId)` |
| B2 | Rejects if account has no names |
| B3 | Rejects if account does not own publisher name |
| B4 | Blog deletion is independent (no cascade) |
| B5 | Failure throws and doesn't affect state |
| B6 | Documents architectural no-cascade invariant |

---

## Build / Test / Lint

```
npm run build   → ✅  tsc + vite, 325.34 kB JS, 16.01 kB CSS
npm test        → ✅  95 passed, 11 files, 4 expected unhandled rejections
npm run lint    → ✅  0 new errors (3 pre-existing in other files)
```

---

## Runtime Test Checklist

### Post-delete redirect
- [ ] After successful post deletion, navigates to `/blog/{publisher}/{blogId}`
- [ ] Does NOT navigate to `qdn://...?blog=...&name=...`
- [ ] Browser Back does not return to deleted post (`replace: true`)
- [ ] Blog page renders normally with remaining posts
- [ ] Deleted post is absent from blog post list

### Blog deletion
- [ ] Delete Blog button visible only to blog owner
- [ ] Delete Blog button hidden for non-owner
- [ ] Delete button placed next to Edit Blog
- [ ] Click opens confirmation without mutation
- [ ] Cancel performs no request
- [ ] Blog with posts: warning shown, Delete button disabled
- [ ] Empty blog: can be deleted after confirmation
- [ ] Confirm targets exact `(BLOG, ownerName, blogId)`
- [ ] Double-submit prevented
- [ ] Success navigates to `/` (home)
- [ ] Deleted blog disappears from blog list
- [ ] Failure keeps blog visible and shows error
- [ ] Old canonical `/blog/{name}/{id}` route shows error for deleted blog
- [ ] Old deep-link `qdn://...?blog=...&name=...` does not resolve deleted blog
- [ ] Edit Blog remains functional
