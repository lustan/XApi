import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EnvironmentItem, HttpRequest, LoggedRequest, MockRule } from '../types';
import { getMethodColor } from '../utils';

interface CommandItem {
  id: string;
  group: string;
  label: string;
  sublabel?: string;
  method?: string;
  onSelect: () => void;
}

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  requests: HttpRequest[];
  history: LoggedRequest[];
  mockRules: MockRule[];
  environments: EnvironmentItem[];
  onSelectRequest: (req: HttpRequest) => void;
  onSelectLog: (log: LoggedRequest) => void;
  onSelectMockRule: (rule: MockRule) => void;
  onSwitchEnv: (envId: string | null) => void;
  onCreateRequest: () => void;
  onOpenImport: () => void;
  onOpenEnvs: () => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  requests,
  history,
  mockRules,
  environments,
  onSelectRequest,
  onSelectLog,
  onSelectMockRule,
  onSwitchEnv,
  onCreateRequest,
  onOpenImport,
  onOpenEnvs,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  const items = useMemo<CommandItem[]>(() => {
    const all: CommandItem[] = [
      {
        id: 'cmd-new-req',
        group: 'Actions',
        label: chrome.i18n.getMessage('newRequest') || 'New Request',
        onSelect: onCreateRequest,
      },
      {
        id: 'cmd-import',
        group: 'Actions',
        label: chrome.i18n.getMessage('importUniversal') || 'Import (cURL / Postman / OpenAPI)',
        onSelect: onOpenImport,
      },
      {
        id: 'cmd-envs',
        group: 'Actions',
        label: chrome.i18n.getMessage('manageEnvironments') || 'Manage Environments',
        onSelect: onOpenEnvs,
      },
    ];

    environments.forEach((env) => {
      all.push({
        id: `env-${env.id}`,
        group: 'Environments',
        label: `Switch Environment: ${env.name}`,
        sublabel: `${env.variables.filter((v) => v.enabled).length} variables`,
        onSelect: () => onSwitchEnv(env.id),
      });
    });

    requests.forEach((r) => {
      all.push({
        id: `req-${r.id}`,
        group: 'Saved Requests',
        label: r.name || r.url || 'Request',
        sublabel: r.url,
        method: r.method,
        onSelect: () => onSelectRequest(r),
      });
    });

    mockRules.forEach((m) => {
      all.push({
        id: `mock-${m.id}`,
        group: 'Mock Rules',
        label: m.name || m.urlPattern || 'Mock Rule',
        sublabel: m.urlPattern,
        method: m.method,
        onSelect: () => onSelectMockRule(m),
      });
    });

    history.slice(0, 30).forEach((h) => {
      all.push({
        id: `log-${h.id}`,
        group: 'Captured',
        label: h.graphqlOperationName ? `${h.graphqlOperationName} · ${h.url}` : h.url,
        sublabel: `${h.status || 'ERR'}`,
        method: h.method,
        onSelect: () => onSelectLog(h),
      });
    });

    const q = query.trim().toLowerCase();
    if (!q) return all.slice(0, 20);
    return all
      .filter(
        (item) =>
          item.label.toLowerCase().includes(q) ||
          (item.sublabel && item.sublabel.toLowerCase().includes(q)) ||
          (item.method && item.method.toLowerCase().includes(q)) ||
          item.group.toLowerCase().includes(q)
      )
      .slice(0, 25);
  }, [query, requests, history, mockRules, environments, onCreateRequest, onOpenImport, onOpenEnvs, onSelectRequest, onSelectLog, onSelectMockRule, onSwitchEnv]);

  if (!isOpen) return null;

  const runItem = (item?: CommandItem) => {
    if (!item) return;
    onClose();
    item.onSelect();
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center pt-20 bg-slate-900/40 backdrop-blur-[1px] px-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={chrome.i18n.getMessage('commandPaletteTitle') || 'Quick Search & Commands'}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden animate-fadeIn"
      >
        <div className="flex items-center px-3.5 py-2.5 border-b border-slate-200 gap-2.5">
          <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIdx(0); }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIdx((i) => Math.min(i + 1, Math.max(0, items.length - 1)));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIdx((i) => Math.max(i - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                runItem(items[selectedIdx]);
              }
            }}
            placeholder={
              chrome.i18n.getMessage('commandPalettePlaceholder') ||
              'Search requests, captured logs, mocks, or commands...'
            }
            className="flex-1 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
          />
          <kbd className="text-[10px] font-mono text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto py-1.5">
          {items.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">No matching items found.</div>
          ) : (
            items.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => runItem(item)}
                onMouseEnter={() => setSelectedIdx(idx)}
                className={`w-full text-left px-4 py-2 flex items-center justify-between gap-3 text-xs transition-colors ${
                  idx === selectedIdx ? 'bg-emerald-50 text-emerald-900' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {item.method && (
                    <span className={`text-[10px] font-bold w-11 flex-shrink-0 ${getMethodColor(item.method)}`}>
                      {item.method}
                    </span>
                  )}
                  <span className="font-medium truncate">{item.label}</span>
                  {item.sublabel && (
                    <span className="text-[11px] text-slate-400 font-mono truncate">{item.sublabel}</span>
                  )}
                </div>
                <span className="text-[10px] text-slate-400 flex-shrink-0">{item.group}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
