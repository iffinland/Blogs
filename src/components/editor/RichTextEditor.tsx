import {
  Bold,
  Code,
  FileUp,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Underline,
  Video,
} from 'lucide-react';
import { type ChangeEvent, type ReactNode, useRef, useState } from 'react';
import {
  publishBlogAttachment,
  publishBlogImage,
  publishBlogVideo,
} from '../../services/blog/mediaService';
import {
  RICH_TEXT_FORMAT_TAGS,
  applyListFormat,
  applyWrapFormat,
  encodeQdnMediaTag,
  insertAtSelection,
  type RichTextFormat,
} from '../../services/blog/richText';

type RichTextEditorProps = {
  value: string;
  ownerName: string;
  disabled?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
};

const formatButtons: Array<{
  type: RichTextFormat;
  label: string;
  shortLabel: string;
  icon: ReactNode;
}> = [
  { type: 'bold', label: 'Bold', shortLabel: 'B', icon: <Bold size={17} /> },
  { type: 'italic', label: 'Italic', shortLabel: 'I', icon: <Italic size={17} /> },
  { type: 'underline', label: 'Underline', shortLabel: 'U', icon: <Underline size={17} /> },
  { type: 'heading2', label: 'Heading', shortLabel: 'H2', icon: <Heading2 size={17} /> },
  { type: 'heading3', label: 'Subheading', shortLabel: 'H3', icon: <Heading3 size={17} /> },
  { type: 'quote', label: 'Quote', shortLabel: 'Quote', icon: <Quote size={17} /> },
  { type: 'code', label: 'Code', shortLabel: 'Code', icon: <Code size={17} /> },
  { type: 'link', label: 'Link', shortLabel: 'Link', icon: <LinkIcon size={17} /> },
];

export function RichTextEditor({
  value,
  ownerName,
  disabled = false,
  placeholder = 'Write your post...',
  onChange,
}: RichTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState('');
  const isUploadDisabled = disabled || !ownerName;

  const focusSelection = (selectionStart: number, selectionEnd: number) => {
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(selectionStart, selectionEnd);
    });
  };

  const applyResult = (result: {
    value: string;
    nextSelectionStart: number;
    nextSelectionEnd: number;
  }) => {
    onChange(result.value);
    focusSelection(result.nextSelectionStart, result.nextSelectionEnd);
  };

  const getSelection = () => ({
    selectionStart: textareaRef.current?.selectionStart ?? value.length,
    selectionEnd: textareaRef.current?.selectionEnd ?? value.length,
  });

  const handleFormat = (format: RichTextFormat) => {
    const [openTag, closeTag] = RICH_TEXT_FORMAT_TAGS[format];
    applyResult(
      applyWrapFormat({
        value,
        ...getSelection(),
        openTag,
        closeTag,
        placeholder: format === 'link' ? 'link text' : 'text',
      }),
    );
  };

  const handleList = (ordered: boolean) => {
    applyResult(applyListFormat({ value, ...getSelection(), ordered }));
  };

  const insertSnippet = (snippet: string) => {
    const borderedSnippet = `${value.trim() ? '\n\n' : ''}${snippet}\n\n`;
    applyResult(insertAtSelection({ value, ...getSelection(), snippet: borderedSnippet }));
  };

  const uploadSelectedFile = async (
    event: ChangeEvent<HTMLInputElement>,
    type: 'image' | 'file' | 'video',
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || isUploadDisabled) return;

    setStatus(`Uploading ${type} to QDN...`);
    try {
      const ref =
        type === 'image'
          ? await publishBlogImage(file, ownerName)
          : type === 'video'
            ? await publishBlogVideo(file, ownerName)
            : await publishBlogAttachment(file, ownerName);
      insertSnippet(encodeQdnMediaTag(type, ref));
      setStatus(`${file.name} inserted.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : `Unable to upload ${type}.`);
    }
  };

  return (
    <div className="rich-editor">
      <div className="rich-toolbar" aria-label="Post formatting tools">
        {formatButtons.map((button) => (
          <button
            key={button.type}
            type="button"
            className="tool-button"
            title={button.label}
            aria-label={button.label}
            onClick={() => handleFormat(button.type)}
            disabled={disabled}
          >
            <span className="tool-icon">{button.icon}</span>
            <span className="tool-label">{button.shortLabel}</span>
          </button>
        ))}
        <span className="toolbar-divider" />
        <button
          type="button"
          className="tool-button"
          title="Bulleted list"
          aria-label="Bulleted list"
          onClick={() => handleList(false)}
          disabled={disabled}
        >
          <span className="tool-icon">
            <List size={17} />
          </span>
          <span className="tool-label">List</span>
        </button>
        <button
          type="button"
          className="tool-button"
          title="Numbered list"
          aria-label="Numbered list"
          onClick={() => handleList(true)}
          disabled={disabled}
        >
          <span className="tool-icon">
            <ListOrdered size={17} />
          </span>
          <span className="tool-label">1.2.</span>
        </button>
        <span className="toolbar-divider" />
        <button
          type="button"
          className="tool-button"
          title="Upload image"
          aria-label="Upload image"
          onClick={() => imageInputRef.current?.click()}
          disabled={isUploadDisabled}
        >
          <span className="tool-icon">
            <ImagePlus size={17} />
          </span>
          <span className="tool-label">IMG</span>
        </button>
        <button
          type="button"
          className="tool-button"
          title="Upload video"
          aria-label="Upload video"
          onClick={() => videoInputRef.current?.click()}
          disabled={isUploadDisabled}
        >
          <span className="tool-icon">
            <Video size={17} />
          </span>
          <span className="tool-label">VID</span>
        </button>
        <button
          type="button"
          className="tool-button"
          title="Upload attachment"
          aria-label="Upload attachment"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploadDisabled}
        >
          <span className="tool-icon">
            <FileUp size={17} />
          </span>
          <span className="tool-label">FILE</span>
        </button>
      </div>
      <textarea
        ref={textareaRef}
        className="rich-textarea"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        hidden
        onChange={(event) => void uploadSelectedFile(event, 'image')}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/webm,video/ogg"
        hidden
        onChange={(event) => void uploadSelectedFile(event, 'video')}
      />
      <input
        ref={fileInputRef}
        type="file"
        hidden
        onChange={(event) => void uploadSelectedFile(event, 'file')}
      />
      {status ? <div className="editor-status">{status}</div> : null}
    </div>
  );
}
