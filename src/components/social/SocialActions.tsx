import { Heart, MessageCircle, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AccountProfile, BlogLikeTargetType } from '../../types/blog';
import { fetchLikeState, publishLike } from '../../services/blog/engagementService';

type SocialActionsLabels = {
  like: string;
  share: string;
  comments: string;
  copied: string;
};

type SocialActionsProps = {
  account: AccountProfile | null;
  targetType: BlogLikeTargetType;
  ownerName: string;
  identifier: string;
  title: string;
  shareLink: string;
  labels: SocialActionsLabels;
  commentsCount?: number;
  showComments?: boolean;
  onComments?: () => void;
  compact?: boolean;
};

const copyWithTextarea = (value: string) => {
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '0';
  textarea.style.width = '1px';
  textarea.style.height = '1px';
  textarea.style.opacity = '0';
  textarea.setAttribute('readonly', 'readonly');
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const copied = document.execCommand('copy');
  textarea.remove();
  return copied;
};

const copyText = async (value: string) => {
  if (copyWithTextarea(value)) return true;

  if (!navigator.clipboard?.writeText) return false;

  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return copyWithTextarea(value);
  }
};

export function SocialActions({
  account,
  targetType,
  ownerName,
  identifier,
  title,
  shareLink,
  labels,
  commentsCount,
  showComments = true,
  onComments,
  compact = false,
}: SocialActionsProps) {
  const [likeCount, setLikeCount] = useState(0);
  const [likedByAccount, setLikedByAccount] = useState(false);
  const [ownedByAccount, setOwnedByAccount] = useState(false);
  const [isLiking, setIsLiking] = useState(false);
  const [shareStatus, setShareStatus] = useState('');

  useEffect(() => {
    let active = true;
    void fetchLikeState({ targetType, ownerName, identifier, account })
      .then((state) => {
        if (!active) return;
        setLikeCount(state.count);
        setLikedByAccount(state.likedByAccount);
        setOwnedByAccount(state.ownedByAccount);
      })
      .catch(() => {
        if (!active) return;
        setLikeCount(0);
        setLikedByAccount(false);
        setOwnedByAccount(Boolean(account?.names.includes(ownerName)));
      });
    return () => {
      active = false;
    };
  }, [account, identifier, ownerName, targetType]);

  const like = async () => {
    if (!account || likedByAccount || ownedByAccount || isLiking) return;

    setIsLiking(true);
    try {
      await publishLike({ targetType, ownerName, identifier, title, account });
      setLikedByAccount(true);
      setLikeCount((current) => current + 1);
    } catch {
      // Keep the current count when QDN publish is rejected or unavailable.
    } finally {
      setIsLiking(false);
    }
  };

  const share = async () => {
    const copied = await copyText(shareLink);
    if (!copied) return;
    setShareStatus(labels.copied);
    window.setTimeout(() => setShareStatus(''), 1800);
  };

  return (
    <div
      className={`social-actions${compact ? ' social-actions-compact' : ''}${
        showComments ? '' : ' social-actions-two'
      }`}
    >
      <button
        type="button"
        className={likedByAccount ? 'liked' : ''}
        onClick={() => void like()}
        disabled={!account || likedByAccount || ownedByAccount || isLiking}
        aria-label={labels.like}
        title={labels.like}
      >
        <Heart size={16} />
        <span>{likeCount}</span>
      </button>
      <button
        type="button"
        className="share-button"
        onClick={() => void share()}
        aria-label={labels.share}
        title={labels.share}
      >
        <Share2 size={16} />
        {shareStatus ? (
          <span className="share-copy-badge" role="status">
            {shareStatus}
          </span>
        ) : null}
      </button>
      {showComments ? (
        <button
          type="button"
          onClick={onComments}
          aria-label={labels.comments}
          title={labels.comments}
        >
          <MessageCircle size={16} />
          {typeof commentsCount === 'number' ? <span>{commentsCount}</span> : null}
        </button>
      ) : null}
    </div>
  );
}
