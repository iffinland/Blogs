import { Search, X } from 'lucide-react';
import { useDeferredValue, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { searchBlogsAndPosts, type BlogSearchResult } from '../../services/blog/blogSearch';
import { HighlightedText } from './HighlightedText';

type GlobalSearchProps = {
  placeholder: string;
  emptyLabel: string;
  loadingLabel: string;
  resultTypeLabels: Record<BlogSearchResult['type'], string>;
};

export function GlobalSearch({
  placeholder,
  emptyLabel,
  loadingLabel,
  resultTypeLabels,
}: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [results, setResults] = useState<BlogSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const normalizedQuery = deferredQuery.trim();

  useEffect(() => {
    let active = true;

    if (normalizedQuery.length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const timer = window.setTimeout(() => {
      void searchBlogsAndPosts(normalizedQuery)
        .then((items) => {
          if (active) setResults(items);
        })
        .catch(() => {
          if (active) setResults([]);
        })
        .finally(() => {
          if (active) setIsLoading(false);
        });
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [normalizedQuery]);

  const hasSearch = query.trim().length >= 2;

  return (
    <div className="global-search">
      <Search className="search-icon" size={17} />
      <input
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setIsOpen(false);
        }}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {query ? (
        <button
          className="search-clear"
          type="button"
          onClick={() => {
            setQuery('');
            setResults([]);
            setIsOpen(false);
          }}
          aria-label="Clear search"
        >
          <X size={15} />
        </button>
      ) : null}

      {isOpen && hasSearch ? (
        <div className="search-popover">
          {isLoading ? <div className="search-state">{loadingLabel}</div> : null}
          {!isLoading && results.length === 0 ? (
            <div className="search-state">{emptyLabel}</div>
          ) : null}
          {!isLoading && results.length > 0
            ? results.map((result) => (
                <Link
                  className="search-result"
                  key={result.id}
                  to={result.url}
                  onClick={() => setIsOpen(false)}
                >
                  <span className="search-result-type">{resultTypeLabels[result.type]}</span>
                  <strong>
                    <HighlightedText text={result.title} query={query} />
                  </strong>
                  <span>
                    <HighlightedText
                      text={result.snippet || result.description || result.identifier}
                      query={query}
                    />
                  </span>
                  <small>{result.name}</small>
                </Link>
              ))
            : null}
        </div>
      ) : null}
    </div>
  );
}
