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
  Palette,
  Quote,
  SmilePlus,
  Underline,
  Video,
  X,
} from 'lucide-react';
import { type ChangeEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import {
  type PendingBlogMedia,
  prepareBlogMedia,
  publishBlogAttachment,
  publishBlogImage,
  publishBlogVideo,
} from '../../services/blog/mediaService';
import {
  RICH_TEXT_FORMAT_TAGS,
  applyColorFormat,
  applyLinkFormat,
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
  onMediaQueued?: (media: PendingBlogMedia) => void;
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

const emojiOptions = ['🙂', '😀', '😁', '😂', '😍', '🔥', '👍', '🙏', '🎉', '💡', '⭐', '❤️'];

const colorOptions = [
  '#111827',
  '#dc2626',
  '#ea580c',
  '#ca8a04',
  '#16a34a',
  '#0891b2',
  '#2563eb',
  '#7c3aed',
];

export function RichTextEditor({
  value,
  ownerName,
  disabled = false,
  placeholder = 'Write your post...',
  onMediaQueued,
  onChange,
}: RichTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const linkUrlInputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState('');
  const [isLinkPopupOpen, setIsLinkPopupOpen] = useState(false);
  const [isEmojiPopupOpen, setIsEmojiPopupOpen] = useState(false);
  const [isColorPopupOpen, setIsColorPopupOpen] = useState(false);
  const [customColor, setCustomColor] = useState(colorOptions[0]);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [savedSelection, setSavedSelection] = useState({ selectionStart: 0, selectionEnd: 0 });
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

  const openLinkPopup = () => {
    const selection = getSelection();
    const selectedText = value.slice(selection.selectionStart, selection.selectionEnd).trim();
    const selectedIsLink = selectedText.toLowerCase().startsWith('qdn://');
    setIsEmojiPopupOpen(false);
    setIsColorPopupOpen(false);
    setSavedSelection(selection);
    setLinkUrl(selectedIsLink ? selectedText : '');
    setLinkLabel(selectedIsLink ? '' : selectedText);
    setIsLinkPopupOpen(true);
    setStatus('');
    requestAnimationFrame(() => linkUrlInputRef.current?.focus());
  };

  const openEmojiPopup = () => {
    setSavedSelection(getSelection());
    setIsLinkPopupOpen(false);
    setIsColorPopupOpen(false);
    setIsEmojiPopupOpen((current) => !current);
    setStatus('');
  };

  const openColorPopup = () => {
    setSavedSelection(getSelection());
    setIsLinkPopupOpen(false);
    setIsEmojiPopupOpen(false);
    setIsColorPopupOpen((current) => !current);
    setStatus('');
  };

  const closeLinkPopup = () => {
    setIsLinkPopupOpen(false);
    focusSelection(savedSelection.selectionStart, savedSelection.selectionEnd);
  };

  const addLink = () => {
    if (!linkUrl.trim()) {
      setStatus('Add a QDN link first.');
      requestAnimationFrame(() => linkUrlInputRef.current?.focus());
      return;
    }

    applyResult(
      applyLinkFormat({
        value,
        ...savedSelection,
        url: linkUrl,
        label: linkLabel,
      }),
    );
    setIsLinkPopupOpen(false);
    setLinkUrl('');
    setLinkLabel('');
    setStatus('Link inserted.');
  };

  const insertEmoji = (emoji: string) => {
    applyResult(insertAtSelection({ value, ...savedSelection, snippet: emoji }));
    setIsEmojiPopupOpen(false);
  };

  const applyTextColor = (color: string) => {
    applyResult(applyColorFormat({ value, ...savedSelection, color }));
    setIsColorPopupOpen(false);
  };

  useEffect(() => {
    if (!isLinkPopupOpen && !isEmojiPopupOpen && !isColorPopupOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsLinkPopupOpen(false);
      setIsEmojiPopupOpen(false);
      setIsColorPopupOpen(false);
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(
          savedSelection.selectionStart,
          savedSelection.selectionEnd,
        );
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isColorPopupOpen, isEmojiPopupOpen, isLinkPopupOpen, savedSelection]);

  const handleFormat = (format: RichTextFormat) => {
    if (format === 'link') {
      openLinkPopup();
      return;
    }

    const [openTag, closeTag] = RICH_TEXT_FORMAT_TAGS[format];
    applyResult(
      applyWrapFormat({
        value,
        ...getSelection(),
        openTag,
        closeTag,
        placeholder: 'text',
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

    try {
      if (onMediaQueued) {
        const media = prepareBlogMedia(file, ownerName, type);
        onMediaQueued(media);
        insertSnippet(encodeQdnMediaTag(type, media.ref));
        setStatus(`${file.name} queued for publish.`);
        return;
      }

      setStatus(`Uploading ${type} to QDN...`);
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
        {isLinkPopupOpen ? (
          <div className="editor-popover link-popover" role="dialog" aria-label="Add link">
            <div className="editor-popover-header">
              <span>Add link</span>
              <button type="button" onClick={closeLinkPopup} aria-label="Close link editor">
                <X size={16} />
              </button>
            </div>
            <label>
              Link
              <input
                ref={linkUrlInputRef}
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
                placeholder="qdn://APP/name/identifier"
              />
            </label>
            <label>
              Label
              <input
                value={linkLabel}
                onChange={(event) => setLinkLabel(event.target.value)}
                placeholder="Optional label"
              />
            </label>
            <div className="link-popover-actions">
              <button type="button" onClick={addLink}>
                Add
              </button>
              <button type="button" onClick={closeLinkPopup}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
        <button
          type="button"
          className="tool-button"
          title="Insert emoji"
          aria-label="Insert emoji"
          onClick={openEmojiPopup}
          disabled={disabled}
        >
          <span className="tool-icon">
            <SmilePlus size={17} />
          </span>
          <span className="tool-label">Emoji</span>
        </button>
        {isEmojiPopupOpen ? (
          <div className="editor-popover emoji-popover" role="dialog" aria-label="Insert emoji">
            <div className="editor-popover-header">
              <span>Insert emoji</span>
              <button
                type="button"
                onClick={() => setIsEmojiPopupOpen(false)}
                aria-label="Close emoji picker"
              >
                <X size={16} />
              </button>
            </div>
            <div className="emoji-grid">
              {emojiOptions.map((emoji) => (
                <button type="button" key={emoji} onClick={() => insertEmoji(emoji)}>
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <button
          type="button"
          className="tool-button"
          title="Text color"
          aria-label="Text color"
          onClick={openColorPopup}
          disabled={disabled}
        >
          <span className="tool-icon">
            <Palette size={17} />
          </span>
          <span className="tool-label">Color</span>
        </button>
        {isColorPopupOpen ? (
          <div className="editor-popover color-popover" role="dialog" aria-label="Text color">
            <div className="editor-popover-header">
              <span>Text color</span>
              <button
                type="button"
                onClick={() => setIsColorPopupOpen(false)}
                aria-label="Close color picker"
              >
                <X size={16} />
              </button>
            </div>
            <div className="color-grid">
              {colorOptions.map((color) => (
                <button
                  type="button"
                  key={color}
                  style={{ backgroundColor: color }}
                  onClick={() => applyTextColor(color)}
                  aria-label={`Use ${color}`}
                />
              ))}
            </div>
            <label className="custom-color-field">
              Custom
              <input
                type="color"
                value={customColor}
                onChange={(event) => setCustomColor(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="popover-primary-button"
              onClick={() => applyTextColor(customColor)}
            >
              Apply
            </button>
          </div>
        ) : null}
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
