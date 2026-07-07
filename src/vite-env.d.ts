/// <reference types="vite/client" />

interface Window {
  qdnRequest?: <T = unknown>(request: Record<string, unknown>) => Promise<T>;
  _qdnService?: string;
  _qdnName?: string;
  _qdnIdentifier?: string;
  _qdnTheme?: string;
  _qdnAccent?: string;
  _qdnTextSize?: string;
  _qdnLang?: string;
  _qdnLanguage?: string;
}
