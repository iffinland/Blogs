import { createSearchHighlightPattern } from '../../services/blog/blogSearch';

type HighlightedTextProps = {
  text: string;
  query: string;
};

export function HighlightedText({ text, query }: HighlightedTextProps) {
  const pattern = createSearchHighlightPattern(query);
  if (!pattern) return <>{text}</>;

  return (
    <>
      {text.split(pattern).map((part, index) =>
        part.match(pattern) ? (
          <mark className="search-highlight" key={`${part}-${index}`}>
            {part}
          </mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )}
    </>
  );
}
