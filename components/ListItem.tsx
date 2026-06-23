import React, { useEffect, useRef, useState } from 'react';

/**
 * Shared two-line list item used by the sidebar Collections / Captured / Mock
 * lists. Keeping all three lists on the same skeleton means style tweaks
 * (active state, density, hover affordances) stay in lockstep.
 *
 * Visual contract (do not drift):
 *   ┌─────────────────────────────────────────────┐
 *   │▎ [METHOD]  meta-extras...        hoverActns │  meta row
 *   │▎ <title (double-click to edit)>             │  primary
 *   │▎ <subtitle, font-mono>                      │  secondary
 *   └─────────────────────────────────────────────┘
 *    ↑ 4px left border — indigo-600 when active, transparent otherwise.
 */
export interface ListItemProps {
  isActive: boolean;
  // meta row
  method?: string;
  methodColorClass?: string;        // pre-computed from getMethodColor()
  metaExtras?: React.ReactNode;     // time, status, hits, etc.
  metaLeading?: React.ReactNode;    // small node before METHOD (e.g. mock toggle dot)
  // titles
  title: string;                    // the editable text; empty triggers fallback
  titleFallback?: string;           // shown italic/grey when title is empty
  subtitle?: string;
  // edit
  editable?: boolean;
  editPlaceholder?: string;
  onRename?: (next: string) => void;
  // When this number changes, the row enters edit mode (lets parents
  // trigger rename from a right-click menu or button without owning the
  // input state). Use any monotonically-changing value (e.g. Date.now()).
  editTrigger?: number;
  // behaviour
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  // drag
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  // hover actions (right side of meta row)
  hoverActions?: React.ReactNode;
  // tooltip on the whole row
  title_?: string;
}

export const ListItem: React.FC<ListItemProps> = ({
  isActive,
  method,
  methodColorClass,
  metaExtras,
  metaLeading,
  title,
  titleFallback,
  subtitle,
  editable = false,
  editPlaceholder,
  onRename,
  editTrigger,
  onClick,
  onContextMenu,
  draggable,
  onDragStart,
  hoverActions,
  title_,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Parent-driven edit trigger (e.g. "Rename" context menu item).
  useEffect(() => {
    if (editTrigger !== undefined && editable && onRename) {
      setEditValue(title);
      setIsEditing(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editTrigger]);

  const enterEdit = (e: React.MouseEvent) => {
    if (!editable || !onRename || isEditing) return;
    e.stopPropagation();
    setEditValue(title);           // input starts blank if title is blank
    setIsEditing(true);
  };

  const commitEdit = () => {
    if (!isEditing) return;
    const next = editValue.trim();
    // Empty submissions are treated as cancels rather than clearing the name.
    if (next && next !== title && onRename) onRename(next);
    setIsEditing(false);
  };

  const cancelEdit = () => setIsEditing(false);

  const displayTitle = title || titleFallback || '';
  const titleIsFallback = !title && !!titleFallback;

  return (
    <div
      draggable={draggable && !isEditing}
      onDragStart={onDragStart}
      onClick={() => { if (!isEditing && onClick) onClick(); }}
      onDoubleClick={enterEdit}
      onContextMenu={onContextMenu}
      title={title_}
      className={`px-3 py-2 cursor-pointer transition-colors group relative border-l-4 ${
        isActive
          ? 'bg-indigo-50 border-indigo-600'
          : 'bg-transparent border-transparent hover:bg-white'
      }`}
    >
      {/* meta row */}
      <div className="flex items-center justify-between mb-1 min-h-[14px]">
        <div className="flex items-center space-x-1.5 min-w-0">
          {metaLeading}
          {method && (
            <span className={`text-[10px] font-bold ${methodColorClass || ''}`}>
              {method}
            </span>
          )}
          {metaExtras}
        </div>
        {hoverActions && (
          <div className={`flex items-center space-x-1 ${
            isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          } transition-opacity`}>
            {hoverActions}
          </div>
        )}
      </div>

      {/* primary title row */}
      <div className="flex flex-col">
        {isEditing ? (
          <input
            ref={inputRef}
            value={editValue}
            placeholder={editPlaceholder}
            onChange={(e) => setEditValue(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
              else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
            }}
            className="text-xs font-semibold bg-white border border-indigo-400 rounded px-1 py-0.5 outline-none focus:border-indigo-500"
          />
        ) : (
          <span
            className={`text-xs font-semibold truncate ${
              isActive ? 'text-indigo-900' : 'text-slate-800'
            } ${titleIsFallback ? 'italic text-gray-400' : ''}`}
            title={displayTitle}
          >
            {displayTitle || '—'}
          </span>
        )}
        {subtitle !== undefined && (
          <span
            className={`text-[10px] truncate font-mono ${
              isActive ? 'text-indigo-600/70' : 'text-slate-500'
            }`}
            title={subtitle || '—'}
          >
            {subtitle || '—'}
          </span>
        )}
      </div>
    </div>
  );
};
