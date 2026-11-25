import React, { useMemo, useState, useCallback } from 'react';

interface JsonTreeProps {
  /** Pre-parsed JSON value, or a JSON string to be parsed by the component */
  value: unknown;
  /** Initial depth that is auto-expanded; deeper nodes start collapsed */
  defaultExpandDepth?: number;
  /** Cap rendered nodes to keep huge JSON responsive. Default 5000. */
  maxNodes?: number;
  /** Optional extra className for the root */
  className?: string;
}

const t = (key: string, fallback: string, substitutions?: string | string[]) => {
  try {
    const m = chrome?.i18n?.getMessage?.(key, substitutions);
    return m || fallback;
  } catch {
    return fallback;
  }
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

const isContainer = (v: unknown): v is Record<string, unknown> | unknown[] =>
  Array.isArray(v) || isPlainObject(v);

interface NodeProps {
  path: string;
  keyLabel: string | number | null;
  value: unknown;
  depth: number;
  isLast: boolean;
  expandedKeys: Set<string>;
  setExpanded: (path: string, expanded: boolean) => void;
  budget: { rendered: number; cap: number };
}

const renderPrimitive = (v: unknown) => {
  if (v === null) return <span className="text-gray-400">null</span>;
  if (typeof v === 'string') return <span className="text-emerald-700">"{v}"</span>;
  if (typeof v === 'number') return <span className="text-blue-600">{String(v)}</span>;
  if (typeof v === 'boolean') return <span className="text-purple-600">{String(v)}</span>;
  if (typeof v === 'undefined') return <span className="text-gray-400">undefined</span>;
  return <span className="text-gray-700">{String(v)}</span>;
};

const TreeNode: React.FC<NodeProps> = ({
  path,
  keyLabel,
  value,
  depth,
  isLast,
  expandedKeys,
  setExpanded,
  budget,
}) => {
  if (budget.rendered >= budget.cap) return null;
  budget.rendered += 1;

  const isOpen = expandedKeys.has(path);
  const indent = { paddingLeft: `${depth * 14}px` };
  const toggle = useCallback(() => setExpanded(path, !isOpen), [isOpen, path, setExpanded]);

  // Primitive leaf
  if (!isContainer(value)) {
    return (
      <div className="flex items-start whitespace-pre-wrap break-words" style={indent}>
        <span className="inline-block w-3 flex-shrink-0" />
        {keyLabel !== null && (
          <span className="text-gray-700 mr-1">
            {typeof keyLabel === 'number' ? keyLabel : `"${keyLabel}"`}
            <span className="text-gray-400">: </span>
          </span>
        )}
        {renderPrimitive(value)}
        {!isLast && <span className="text-gray-400">,</span>}
      </div>
    );
  }

  const isArray = Array.isArray(value);
  const entries: Array<[string | number, unknown]> = isArray
    ? (value as unknown[]).map((v, i) => [i, v])
    : Object.entries(value as Record<string, unknown>);
  const open = isArray ? '[' : '{';
  const close = isArray ? ']' : '}';
  const summary = isArray
    ? (entries.length === 1
        ? t('jsonItemSingleSummary', '1 item')
        : t('jsonItemsSummary', `${entries.length} items`, [String(entries.length)]))
    : (entries.length === 1
        ? t('jsonKeySingleSummary', '1 key')
        : t('jsonKeysSummary', `${entries.length} keys`, [String(entries.length)]));

  return (
    <div>
      <div
        className="flex items-start cursor-pointer hover:bg-gray-50 select-none"
        style={indent}
        onClick={toggle}
      >
        <span className="inline-block w-3 flex-shrink-0 text-gray-400 text-[10px] leading-[18px] text-center">
          {isOpen ? '▾' : '▸'}
        </span>
        {keyLabel !== null && (
          <span className="text-gray-700 mr-1">
            {typeof keyLabel === 'number' ? keyLabel : `"${keyLabel}"`}
            <span className="text-gray-400">: </span>
          </span>
        )}
        <span className="text-gray-500">{open}</span>
        {!isOpen && (
          <>
            <span className="text-gray-400 text-[10px] mx-1">{summary}</span>
            <span className="text-gray-500">{close}</span>
            {!isLast && <span className="text-gray-400">,</span>}
          </>
        )}
      </div>

      {isOpen && (
        <>
          {entries.map(([k, v], idx) => (
            <TreeNode
              key={String(k)}
              path={`${path}.${k}`}
              keyLabel={k}
              value={v}
              depth={depth + 1}
              isLast={idx === entries.length - 1}
              expandedKeys={expandedKeys}
              setExpanded={setExpanded}
              budget={budget}
            />
          ))}
          <div className="flex items-start" style={indent}>
            <span className="inline-block w-3 flex-shrink-0" />
            <span className="text-gray-500">{close}</span>
            {!isLast && <span className="text-gray-400">,</span>}
          </div>
        </>
      )}
    </div>
  );
};

/** Collect every container path up to a given depth — used to seed expandedKeys. */
const collectInitialExpanded = (value: unknown, depth: number): Set<string> => {
  const set = new Set<string>();
  if (depth <= 0) return set;
  const walk = (v: unknown, path: string, remaining: number) => {
    if (!isContainer(v) || remaining <= 0) return;
    set.add(path);
    if (Array.isArray(v)) {
      v.forEach((c, i) => walk(c, `${path}.${i}`, remaining - 1));
    } else {
      Object.entries(v as Record<string, unknown>).forEach(([k, c]) =>
        walk(c, `${path}.${k}`, remaining - 1)
      );
    }
  };
  walk(value, '$', depth);
  return set;
};

/** Walk every container path — used for "expand all". Capped to keep memory bounded. */
const collectAllPaths = (value: unknown, cap = 50_000): Set<string> => {
  const set = new Set<string>();
  const walk = (v: unknown, path: string) => {
    if (set.size >= cap) return;
    if (!isContainer(v)) return;
    set.add(path);
    if (Array.isArray(v)) {
      v.forEach((c, i) => walk(c, `${path}.${i}`));
    } else {
      Object.entries(v as Record<string, unknown>).forEach(([k, c]) =>
        walk(c, `${path}.${k}`)
      );
    }
  };
  walk(value, '$');
  return set;
};

export const JsonTree: React.FC<JsonTreeProps> = ({
  value,
  defaultExpandDepth = 2,
  maxNodes = 5000,
  className,
}) => {
  // Accept either a parsed value or a JSON string.
  const parsed = useMemo(() => {
    if (typeof value !== 'string') return { ok: true as const, data: value };
    try {
      return { ok: true as const, data: JSON.parse(value) };
    } catch (e: any) {
      return { ok: false as const, error: e?.message || 'Invalid JSON', raw: value };
    }
  }, [value]);

  const initialExpanded = useMemo(
    () => (parsed.ok ? collectInitialExpanded(parsed.data, defaultExpandDepth) : new Set<string>()),
    [parsed, defaultExpandDepth]
  );
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(initialExpanded);

  // Reset expansion state when the underlying value changes.
  React.useEffect(() => {
    setExpandedKeys(initialExpanded);
  }, [initialExpanded]);

  const setExpanded = useCallback((path: string, expanded: boolean) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (expanded) next.add(path);
      else next.delete(path);
      return next;
    });
  }, []);

  const expandAll = () => {
    if (!parsed.ok) return;
    setExpandedKeys(collectAllPaths(parsed.data));
  };
  const collapseAll = () => setExpandedKeys(new Set());

  const expandAllText = t('jsonExpandAll', 'Expand all');
  const collapseAllText = t('jsonCollapseAll', 'Collapse all');
  const tooLargeText = t('jsonTreeTooLarge', 'Tree too large to render fully — showing first nodes only.');
  const invalidJsonText = t('invalidJSON', 'Invalid JSON');

  if (!parsed.ok) {
    return (
      <pre className={`whitespace-pre-wrap break-words text-xs font-mono text-gray-800 ${className || ''}`}>
        <span className="text-red-600">⚠ {invalidJsonText}: {parsed.error}</span>
        {'\n'}
        {parsed.raw}
      </pre>
    );
  }

  // Primitive root — no controls, just render the value.
  if (!isContainer(parsed.data)) {
    return (
      <div className={`font-mono text-xs ${className || ''}`}>
        {renderPrimitive(parsed.data)}
      </div>
    );
  }

  const budget = { rendered: 0, cap: maxNodes };

  return (
    <div className={`font-mono text-xs ${className || ''}`}>
      <div className="flex items-center gap-2 mb-1 text-[10px] text-gray-500">
        <button
          type="button"
          onClick={expandAll}
          className="rounded border border-gray-200 px-2 py-0.5 hover:bg-gray-50"
        >
          {expandAllText}
        </button>
        <button
          type="button"
          onClick={collapseAll}
          className="rounded border border-gray-200 px-2 py-0.5 hover:bg-gray-50"
        >
          {collapseAllText}
        </button>
      </div>
      <TreeNode
        path="$"
        keyLabel={null}
        value={parsed.data}
        depth={0}
        isLast
        expandedKeys={expandedKeys}
        setExpanded={setExpanded}
        budget={budget}
      />
      {budget.rendered >= budget.cap && (
        <div className="mt-2 text-[10px] text-amber-600">⚠ {tooLargeText}</div>
      )}
    </div>
  );
};
