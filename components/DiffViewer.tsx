import React, { useMemo, useState } from 'react';
import { LoggedRequest } from '../types';
import { computeLineDiff, prettyJsonOrRaw } from '../importExportUtils';
import { getMethodBadgeColor, formatTime } from '../utils';

interface DiffViewerProps {
  left: LoggedRequest;
  right: LoggedRequest;
}

type DiffSection = 'response' | 'request' | 'headers';

export const DiffViewer: React.FC<DiffViewerProps> = ({ left, right }) => {
  const [section, setSection] = useState<DiffSection>('response');

  const diffLines = useMemo(() => {
    if (section === 'response') {
      return computeLineDiff(
        prettyJsonOrRaw(left.responseBody || '(No captured response body)'),
        prettyJsonOrRaw(right.responseBody || '(No captured response body)')
      );
    }
    if (section === 'request') {
      return computeLineDiff(
        prettyJsonOrRaw(left.requestBody || '(Empty request body)'),
        prettyJsonOrRaw(right.requestBody || '(Empty request body)')
      );
    }
    return computeLineDiff(
      prettyJsonOrRaw(left.requestHeaders || {}),
      prettyJsonOrRaw(right.requestHeaders || {})
    );
  }, [left, right, section]);

  const addedCount = diffLines.filter((d) => d.type === 'added').length;
  const removedCount = diffLines.filter((d) => d.type === 'removed').length;

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* Header Summary */}
      <div className="border-b border-slate-200 bg-slate-50/70 px-5 py-3 grid grid-cols-2 gap-4 flex-shrink-0">
        {[
          { label: 'Baseline (A)', item: left },
          { label: 'Compare (B)', item: right },
        ].map(({ label, item }) => (
          <div key={item.id + label} className="bg-white border border-slate-200 rounded-lg px-3.5 py-2.5 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase text-slate-400">{label}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${getMethodBadgeColor(item.method)}`}>
                  {item.method}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums text-slate-500">
                <span>{formatTime(item.timestamp)}</span>
                {typeof item.duration === 'number' && <span>{item.duration}ms</span>}
                <span className={`font-bold ${item.status >= 400 ? 'text-red-600' : 'text-emerald-700'}`}>
                  {item.status || 'ERR'}
                </span>
              </div>
            </div>
            <div className="text-xs font-mono text-slate-700 truncate" title={item.url}>
              {item.url}
            </div>
          </div>
        ))}
      </div>

      {/* Section Toolbar */}
      <div className="px-5 py-2 border-b border-slate-200 flex items-center justify-between bg-white flex-shrink-0">
        <div className="flex items-center gap-1">
          {[
            { id: 'response' as DiffSection, label: 'Response Body' },
            { id: 'request' as DiffSection, label: 'Request Body' },
            { id: 'headers' as DiffSection, label: 'Request Headers' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSection(t.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                section === t.id
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
          <span className="text-emerald-700 font-semibold">+{addedCount}</span>
          <span className="text-red-600 font-semibold">-{removedCount}</span>
        </div>
      </div>

      {/* Unified Line Diff */}
      <div className="flex-1 overflow-auto bg-slate-50/40 p-4 font-mono text-xs">
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          {diffLines.map((line, i) => (
            <div
              key={i}
              className={`flex items-start px-3 py-0.5 border-b border-slate-100/70 last:border-b-0 ${
                line.type === 'added'
                  ? 'bg-emerald-50/80 text-emerald-900'
                  : line.type === 'removed'
                  ? 'bg-red-50/80 text-red-900'
                  : 'text-slate-700'
              }`}
            >
              <span className="w-8 flex-shrink-0 text-right pr-2 text-slate-400 select-none tabular-nums">
                {line.leftLine || ''}
              </span>
              <span className="w-8 flex-shrink-0 text-right pr-2 text-slate-400 select-none tabular-nums">
                {line.rightLine || ''}
              </span>
              <span className="w-4 flex-shrink-0 font-bold select-none">
                {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
              </span>
              <pre className="flex-1 whitespace-pre-wrap break-all">{line.text}</pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
