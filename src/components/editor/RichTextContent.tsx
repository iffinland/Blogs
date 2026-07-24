import { Download } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { QdnResourceRef, QdnService } from '../../types/blog';
import { getQdnResourceUrl } from '../../services/qdn/qdnService';
import { useQdnImageUrl } from '../../services/qdn/useQdnImageUrl';
import { getSafeLinkHref, autolinkText } from '../../services/blog/richText';
import { requestQortium } from '../../services/qortium/qortiumClient';

type RichTextContentProps = {
  value: string;
};

// ── Link type classification ───────────────────────────────

type LinkKind = 'internal-nav' | 'web' | 'local' | 'blocked';

const classifyLinkHref = (href: string): LinkKind => {
  const lower = href.toLowerCase();
  if (lower.startsWith('qdn://') || lower.startsWith('home://') || lower.startsWith('core://')) {
    return 'internal-nav';
  }
  if (lower.startsWith('https://') || lower.startsWith('http://')) return 'web';
  if (href.startsWith('/') || href.startsWith('#') || href.startsWith('?')) return 'local';
  return 'blocked';
};

// ── Internal-link navigation (Qortium Home OPEN_NEW_TAB) ────

const openInternalLink = async (address: string) => {
  try {
    await requestQortium({ action: 'OPEN_NEW_TAB', address });
  } catch {
    // In browser-dev mode OPEN_NEW_TAB is not available.
    // Fall back to letting the <a href> navigate.
    window.open(address, '_blank');
  }
};

// ── Clipboard ───────────────────────────────────────────────

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

// ── RichLink ────────────────────────────────────────────────

const COPY_BADGE_MS = 1800;

function RichLink({ href, children }: { href: string; children: ReactNode }) {
  const kind = classifyLinkHref(href);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const handleClick = useCallback(
    async (event: React.MouseEvent) => {
      if (kind === 'internal-nav') {
        event.preventDefault();
        await openInternalLink(href);
        return;
      }
      if (kind === 'web') {
        event.preventDefault();
        if (timerRef.current) clearTimeout(timerRef.current);
        const ok = await copyText(href);
        setCopyState(ok ? 'copied' : 'failed');
        timerRef.current = setTimeout(() => setCopyState('idle'), COPY_BADGE_MS);
      }
    },
    [href, kind],
  );

  if (kind === 'blocked') return <span>{children}</span>;

  return (
    <span className="rich-link-wrapper">
      <a
        href={href}
        onClick={handleClick}
      >
        {children}
      </a>
      {copyState !== 'idle' && (
        <span
          className={`rich-copy-badge${copyState === 'failed' ? ' rich-copy-badge-failed' : ''}`}
          role="status"
        >
          {copyState === 'copied' ? 'Copied' : 'Copy failed'}
        </span>
      )}
    </span>
  );
}

// ── Tokenizer / renderer ────────────────────────────────────

type Token =
  | { kind: 'text'; value: string }
  | { kind: 'wrap'; tag: string; value: string; param?: string }
  | { kind: 'media'; type: 'image' | 'video' | 'file'; value: string };

const tokenPattern =
  /\[(b|i|u|h2|h3|quote|code)\]([\s\S]*?)\[\/\1\]|\[color=(#[0-9a-f]{6})\]([\s\S]*?)\[\/color\]|\[url=([^\]]+)\]([\s\S]*?)\[\/url\]|\[(image|video|file)qdn\]([\s\S]*?)\[\/\7qdn\]/gi;

const decodeTagValue = (value: string | undefined) => {
  try {
    return decodeURIComponent(value ?? '');
  } catch {
    return value ?? '';
  }
};

const parseMediaRef = (type: 'image' | 'video' | 'file', payload: string): QdnResourceRef => {
  const [name, identifier, filename, mimeType, size] = payload.split('|').map(decodeTagValue);
  const serviceByType: Record<'image' | 'video' | 'file', QdnService> = {
    image: 'IMAGE',
    video: 'VIDEO',
    file: 'FILE',
  };

  return {
    service: serviceByType[type],
    name,
    identifier,
    filename: filename || undefined,
    mimeType: mimeType || undefined,
    size: Number.isFinite(Number(size)) ? Number(size) : undefined,
  };
};

const tokenize = (value: string) => {
  const tokens: Token[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  tokenPattern.lastIndex = 0;

  while ((match = tokenPattern.exec(value))) {
    if (match.index > cursor) {
      tokens.push({ kind: 'text', value: value.slice(cursor, match.index) });
    }

    if (match[1]) {
      tokens.push({ kind: 'wrap', tag: match[1].toLowerCase(), value: match[2] });
    } else if (match[3]) {
      tokens.push({ kind: 'wrap', tag: 'color', param: match[3], value: match[4] });
    } else if (match[5]) {
      tokens.push({ kind: 'wrap', tag: 'url', param: match[5], value: match[6] });
    } else if (match[7]) {
      tokens.push({
        kind: 'media',
        type: match[7].toLowerCase() as 'image' | 'video' | 'file',
        value: match[8],
      });
    }

    cursor = match.index + match[0].length;
  }

  if (cursor < value.length) {
    tokens.push({ kind: 'text', value: value.slice(cursor) });
  }

  return tokens;
};

const renderTextSegments = (segments: ReturnType<typeof autolinkText>, keyPrefix: string): ReactNode[] =>
  segments.flatMap((segment, index) => {
    const key = `${keyPrefix}-${index}`;
    if (segment.kind === 'link') {
      const href = getSafeLinkHref(segment.href);
      if (!href) return splitTextLines(segment.value, key);
      return <RichLink key={key} href={href}>{segment.value}</RichLink>;
    }
    return splitTextLines(segment.value, key);
  });

const splitTextLines = (value: string, keyPrefix: string) =>
  value.split(/\r?\n/).flatMap((line, index, lines) => {
    const displayLine = /^\s*-\s+/.test(line)
      ? line.replace(/^\s*-\s+/, '• ')
      : /^\s*\d+\.\s+/.test(line)
        ? line.trim()
        : line;
    const nodes: ReactNode[] = [<span key={`${keyPrefix}-${index}`}>{displayLine}</span>];
    if (index < lines.length - 1) nodes.push(<br key={`${keyPrefix}-${index}-br`} />);
    return nodes;
  });

function MediaNode({ type, payload }: { type: 'image' | 'video' | 'file'; payload: string }) {
  const ref = useMemo(() => parseMediaRef(type, payload), [payload, type]);

  if (type === 'image') {
    return <MediaImage refData={ref} />;
  }

  // Video and file types use the simpler URL-only flow (no image recovery needed)
  const [url, setUrl] = useState('');

  useEffect(() => {
    let active = true;
    void getQdnResourceUrl(ref)
      .then((resourceUrl) => {
        if (active) setUrl(resourceUrl);
      })
      .catch(() => {
        if (active) setUrl('');
      });
    return () => {
      active = false;
    };
  }, [ref]);

  if (!url) {
    return <div className="media-placeholder">{ref.filename || ref.identifier}</div>;
  }

  if (type === 'video') {
    return <video className="rich-media-video" src={url} controls preload="metadata" />;
  }

  return (
    <a
      className="rich-file-card"
      href={url}
      download={ref.filename}
      target="_blank"
      rel="noreferrer"
    >
      <Download size={18} />
      <span>{ref.filename || ref.identifier}</span>
    </a>
  );
}

function MediaImage({ refData }: { refData: QdnResourceRef }) {
  const { url, handleError } = useQdnImageUrl(refData);

  if (!url) {
    return <div className="media-placeholder">{refData.filename || refData.identifier}</div>;
  }

  return (
    <img
      className="rich-media-image"
      src={url}
      alt={refData.filename || refData.identifier}
      onError={handleError}
    />
  );
}

const renderTokens = (tokens: Token[], keyPrefix: string): ReactNode[] =>
  tokens.map((token, index) => {
    const key = `${keyPrefix}-${index}`;
    if (token.kind === 'text') return renderTextSegments(autolinkText(token.value), key);
    if (token.kind === 'media')
      return <MediaNode key={key} type={token.type} payload={token.value} />;

    const children = renderTokens(tokenize(token.value), key);
    if (token.tag === 'b') return <strong key={key}>{children}</strong>;
    if (token.tag === 'i') return <em key={key}>{children}</em>;
    if (token.tag === 'u') return <u key={key}>{children}</u>;
    if (token.tag === 'h2') return <h2 key={key}>{children}</h2>;
    if (token.tag === 'h3') return <h3 key={key}>{children}</h3>;
    if (token.tag === 'quote') return <blockquote key={key}>{children}</blockquote>;
    if (token.tag === 'code') return <code key={key}>{token.value}</code>;
    if (token.tag === 'color') {
      const color = /^#[0-9a-f]{6}$/i.test(token.param ?? '') ? token.param : undefined;
      return (
        <span key={key} style={color ? { color } : undefined}>
          {children}
        </span>
      );
    }
    if (token.tag === 'url') {
      const href = getSafeLinkHref(token.param);
      if (!href) return <span key={key}>{children}</span>;
      return <RichLink key={key} href={href}>{children}</RichLink>;
    }
    return children;
  });

export function RichTextContent({ value }: RichTextContentProps) {
  return <div className="rich-content">{renderTokens(tokenize(value), 'root')}</div>;
}
