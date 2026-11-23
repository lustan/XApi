import React, { useState } from 'react';
import { MockRule } from '../types';
import { formatUrl, getMethodColor } from '../utils';
import { ListItem } from './ListItem';

interface MockListProps {
  rules: MockRule[];
  globalEnabled: boolean;
  activeRuleId?: string;
  onSelect: (rule: MockRule) => void;
  onCreate: () => void;
  onToggleGlobal: () => void;
  onToggleRule: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onClear: () => void;
  onRename: (id: string, newName: string) => void;
}

const t = (key: string, fallback: string) => {
  try {
    const m = chrome.i18n.getMessage(key);
    return m || fallback;
  } catch {
    return fallback;
  }
};

const splitPattern = (pattern: string): { host: string; uri: string } => {
  if (!pattern) return { host: '', uri: '' };
  if (/^https?:\/\//i.test(pattern)) {
    const { origin, path } = formatUrl(pattern);
    return { host: origin, uri: path || '/' };
  }
  return { host: '', uri: pattern };
};

const clampPosition = (x: number, y: number, width: number, height: number) => {
  const maxX = Math.max(8, (typeof window !== 'undefined' ? window.innerWidth : 1200) - width - 8);
  const maxY = Math.max(8, (typeof window !== 'undefined' ? window.innerHeight : 800) - height - 8);
  return {
    left: Math.min(Math.max(8, x), maxX),
    top: Math.min(Math.max(8, y), maxY),
  };
};

export const MockList: React.FC<MockListProps> = ({
  rules, globalEnabled, activeRuleId,
  onSelect, onCreate, onToggleGlobal, onToggleRule, onDelete, onDuplicate, onClear, onRename
}) => {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [renameTicks, setRenameTicks] = useState<Record<string, number>>({});

  React.useEffect(() => {
    const close = () => setContextMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const activeLabel = t('mockGlobalActive', 'Activating');
  const pausedLabel = t('paused', 'Paused');
  const newRuleText = t('mockNewRule', 'New Rule');
  const emptyText = t('mockListEmpty', 'No mock rules yet');
  const emptyHintText = t('mockListEmptyHint', 'Right-click a captured request → "Mock this" to start fast.');
  const hitsLabel = t('mockHits', 'Hits');
  const deleteText = t('delete', 'Delete');
  const duplicateText = t('duplicate', 'Duplicate');
  const renameText = t('rename', 'Rename');
  const clearText = t('clear', 'Clear');
  const ruleNamePlaceholder = t('mockRuleNamePlaceholder', 'Rule name');

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onToggleGlobal}
              title={globalEnabled ? activeLabel : pausedLabel}
              className={`flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border transition-colors ${
                globalEnabled
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${globalEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              {globalEnabled ? activeLabel : pausedLabel}
            </button>
          </div>
          <div className="flex items-center space-x-2">
            {rules.length > 0 && (
              <button
                type="button"
                onClick={onClear}
                className="text-[11px] text-slate-400 hover:text-red-500 font-semibold transition-colors"
              >
                {clearText}
              </button>
            )}
            <button
              type="button"
              onClick={onCreate}
              className="text-[11px] text-emerald-600 hover:text-emerald-700 font-semibold flex items-center transition-colors"
            >
              <svg className="w-3.5 h-3.5 mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              {newRuleText}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar">
        {rules.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center h-full">
            <svg className="w-8 h-8 text-slate-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <div className="text-xs font-medium text-slate-600 mb-1">{emptyText}</div>
            <div className="text-[11px] text-slate-400 leading-relaxed mb-3">{emptyHintText}</div>
            <button
              type="button"
              onClick={onCreate}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
            >
              {newRuleText}
            </button>
          </div>
        ) : (
          <div className="space-y-0.5">
            {rules.map(r => {
              const isActive = activeRuleId === r.id;
              const { host, uri } = splitPattern(r.urlPattern);
              const ruleActivating = globalEnabled && r.enabled;
              const rulePausedByGlobal = !globalEnabled && r.enabled;
              const titleFallback = host || 'ANY';
              const subtitle = r.name
                ? `${host}${uri || ''}` || '/'
                : (uri || '/');

              const toggleDot = (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onToggleRule(r.id); }}
                  title={r.enabled ? (globalEnabled ? 'Disable' : 'Paused') : 'Enable'}
                  aria-label={r.name || r.urlPattern || 'Toggle mock rule'}
                  className={`flex h-3.5 w-3.5 items-center justify-center rounded-full flex-shrink-0 transition-colors ${r.enabled ? 'bg-emerald-50' : 'bg-transparent'}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full transition-all ${ruleActivating ? 'bg-emerald-500' : rulePausedByGlobal ? 'bg-emerald-300' : 'bg-slate-300'}`} />
                </button>
              );

              return (
                <ListItem
                  key={r.id}
                  isActive={isActive}
                  metaLeading={toggleDot}
                  method={r.method}
                  methodColorClass={getMethodColor(r.method === 'ANY' ? '' : r.method)}
                  metaExtras={
                    <>
                      <span className="text-[10px] text-slate-400 uppercase">{r.mode === 'replace' ? 'replace' : 'patch'}</span>
                      <span className="text-[10px] text-slate-400 ml-1 tabular-nums">{hitsLabel}: {r.hitCount || 0}</span>
                    </>
                  }
                  title={r.name}
                  titleFallback={titleFallback}
                  subtitle={subtitle}
                  editable
                  editPlaceholder={ruleNamePlaceholder}
                  editTrigger={renameTicks[r.id]}
                  onRename={(next) => onRename(r.id, next)}
                  onClick={() => onSelect(r)}
                  onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, id: r.id }); }}
                  title_={r.name || undefined}
                />
              );
            })}
          </div>
        )}
      </div>

      {contextMenu && (
        <div
          className="fixed bg-white border border-slate-200 shadow-xl rounded-lg py-1.5 z-[100] w-44 animate-fadeIn border-t-2 border-t-emerald-600"
          style={clampPosition(contextMenu.x, contextMenu.y, 176, 130)}
        >
          <button
            type="button"
            className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-100 flex items-center"
            onClick={() => {
              const id = contextMenu.id;
              setRenameTicks(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
              setContextMenu(null);
            }}
          >
            <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
            {renameText}
          </button>
          <button
            type="button"
            className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-100 flex items-center"
            onClick={() => { onDuplicate(contextMenu.id); setContextMenu(null); }}
          >
            <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
            {duplicateText}
          </button>
          <button
            type="button"
            className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center"
            onClick={() => { onDelete(contextMenu.id); setContextMenu(null); }}
          >
            <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            {deleteText}
          </button>
        </div>
      )}
    </div>
  );
};
