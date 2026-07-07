import { Download } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { QdnResourceRef, QdnService } from '../../types/blog';
import { getQdnResourceUrl } from '../../services/qdn/qdnService';

type RichTextContentProps = {
  value: string;
};

type Token =
  | { kind: 'text'; value: string }
  | { kind: 'wrap'; tag: string; value: string; param?: string }
  | { kind: 'media'; type: 'image' | 'video' | 'file'; value: string };

const tokenPattern =
  /\[(b|i|u|h2|h3|quote|code)\]([\s\S]*?)\[\/\1\]|\[url=([^\]]+)\]([\s\S]*?)\[\/url\]|\[(image|video|file)qdn\]([\s\S]*?)\[\/\5qdn\]/gi;

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
      tokens.push({ kind: 'wrap', tag: 'url', param: match[3], value: match[4] });
    } else if (match[5]) {
      tokens.push({
        kind: 'media',
        type: match[5].toLowerCase() as 'image' | 'video' | 'file',
        value: match[6],
      });
    }

    cursor = match.index + match[0].length;
  }

  if (cursor < value.length) {
    tokens.push({ kind: 'text', value: value.slice(cursor) });
  }

  return tokens;
};

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

  if (type === 'image') {
    return <img className="rich-media-image" src={url} alt={ref.filename || ref.identifier} />;
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

const renderTokens = (tokens: Token[], keyPrefix: string): ReactNode[] =>
  tokens.map((token, index) => {
    const key = `${keyPrefix}-${index}`;
    if (token.kind === 'text') return splitTextLines(token.value, key);
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
    if (token.tag === 'url') {
      return (
        <a key={key} href={token.param} target="_blank" rel="noreferrer">
          {children}
        </a>
      );
    }
    return children;
  });

export function RichTextContent({ value }: RichTextContentProps) {
  return <div className="rich-content">{renderTokens(tokenize(value), 'root')}</div>;
}
