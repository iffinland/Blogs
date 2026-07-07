import type { QdnResourceRef } from '../../types/blog';

export type RichTextFormat =
  'bold' | 'italic' | 'underline' | 'heading2' | 'heading3' | 'quote' | 'code' | 'link';

export const RICH_TEXT_FORMAT_TAGS: Record<RichTextFormat, [string, string]> = {
  bold: ['[b]', '[/b]'],
  italic: ['[i]', '[/i]'],
  underline: ['[u]', '[/u]'],
  heading2: ['[h2]', '[/h2]'],
  heading3: ['[h3]', '[/h3]'],
  quote: ['[quote]', '[/quote]'],
  code: ['[code]', '[/code]'],
  link: ['[url=https://]', '[/url]'],
};

export type SelectionFormatResult = {
  value: string;
  nextSelectionStart: number;
  nextSelectionEnd: number;
};

export const applyWrapFormat = ({
  value,
  selectionStart,
  selectionEnd,
  openTag,
  closeTag,
  placeholder = 'text',
}: {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  openTag: string;
  closeTag: string;
  placeholder?: string;
}): SelectionFormatResult => {
  const start = Math.min(selectionStart, selectionEnd);
  const end = Math.max(selectionStart, selectionEnd);
  const selected = value.slice(start, end) || placeholder;
  const before = value.slice(0, start);
  const after = value.slice(end);
  const inserted = `${openTag}${selected}${closeTag}`;

  return {
    value: `${before}${inserted}${after}`,
    nextSelectionStart: start + openTag.length,
    nextSelectionEnd: start + openTag.length + selected.length,
  };
};

export const applyListFormat = ({
  value,
  selectionStart,
  selectionEnd,
  ordered,
}: {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  ordered: boolean;
}): SelectionFormatResult => {
  const start = Math.min(selectionStart, selectionEnd);
  const end = Math.max(selectionStart, selectionEnd);
  const selected = value.slice(start, end) || 'List item';
  const lines = selected.split(/\r?\n/);
  const formatted = lines
    .map((line, index) => `${ordered ? `${index + 1}.` : '-'} ${line.replace(/^(\d+\.|-)\s+/, '')}`)
    .join('\n');

  return {
    value: `${value.slice(0, start)}${formatted}${value.slice(end)}`,
    nextSelectionStart: start,
    nextSelectionEnd: start + formatted.length,
  };
};

export const insertAtSelection = ({
  value,
  selectionStart,
  selectionEnd,
  snippet,
}: {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  snippet: string;
}): SelectionFormatResult => {
  const start = Math.min(selectionStart, selectionEnd);
  const end = Math.max(selectionStart, selectionEnd);

  return {
    value: `${value.slice(0, start)}${snippet}${value.slice(end)}`,
    nextSelectionStart: start + snippet.length,
    nextSelectionEnd: start + snippet.length,
  };
};

const encodeTagValue = (value: string | number | undefined) =>
  encodeURIComponent(String(value ?? ''));

const decodeTagValue = (value: string | undefined) => {
  try {
    return decodeURIComponent(value ?? '');
  } catch {
    return value ?? '';
  }
};

export const encodeQdnMediaTag = (type: 'image' | 'video' | 'file', ref: QdnResourceRef) => {
  const payload = [ref.name, ref.identifier, ref.filename, ref.mimeType, ref.size].map(
    encodeTagValue,
  );
  return `[${type}qdn]${payload.join('|')}[/${type}qdn]`;
};

export const decodeQdnMediaPayload = (payload: string): QdnResourceRef => {
  const [name, identifier, filename, mimeType, size] = payload.split('|').map(decodeTagValue);
  return {
    service: 'FILE',
    name,
    identifier,
    filename: filename || undefined,
    mimeType: mimeType || undefined,
    size: Number.isFinite(Number(size)) ? Number(size) : undefined,
  };
};

export const findFirstQdnImageRef = (value: string): QdnResourceRef | null => {
  const match = value.match(/\[imageqdn\]([\s\S]*?)\[\/imageqdn\]/i);
  if (!match) return null;
  return {
    ...decodeQdnMediaPayload(match[1]),
    service: 'IMAGE',
  };
};

export const stripRichTextMarkup = (value: string) =>
  value
    .replace(/\[(\/)?(b|i|u|h2|h3|quote|code)\]/gi, '')
    .replace(/\[url=[^\]]+\]([\s\S]*?)\[\/url\]/gi, '$1')
    .replace(/\[(image|video|file)qdn\][\s\S]*?\[\/\1qdn\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
