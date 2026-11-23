import React, { useState, useRef, useEffect } from 'react';
import { TabItem, CollectionItem } from '../types';
import { getMethodColor } from '../utils';

interface TabBarProps {
    tabs: TabItem[];
    activeTabId: string;
    onTabClick: (id: string) => void;
    onTabClose: (id: string, e?: React.MouseEvent) => void;
    onTabReorder: (fromIndex: number, toIndex: number) => void;
    onTabRename: (id: string, newName: string) => void;
    onTabAction: (action: 'close-others' | 'close-right' | 'close-left' | 'close-all', targetId: string) => void;
    collections: CollectionItem[];
    onSaveToCollection: (reqId: string, colId: string) => void;
    leftSlot?: React.ReactNode;
}

const clampPosition = (x: number, y: number, width: number, height: number) => {
    const maxX = Math.max(8, (typeof window !== 'undefined' ? window.innerWidth : 1200) - width - 8);
    const maxY = Math.max(8, (typeof window !== 'undefined' ? window.innerHeight : 800) - height - 8);
    return {
        left: Math.min(Math.max(8, x), maxX),
        top: Math.min(Math.max(8, y), maxY),
    };
};

export const TabBar: React.FC<TabBarProps> = ({
    tabs, activeTabId, onTabClick, onTabClose, onTabReorder, onTabRename, onTabAction, collections, onSaveToCollection, leftSlot
}) => {
    const saveToCollectionText = chrome.i18n.getMessage("saveToCollection");
    const noCollectionsText = chrome.i18n.getMessage("noCollectionsFound");
    const closeTabText = chrome.i18n.getMessage("closeTab");
    const listAllTabsText = chrome.i18n.getMessage("listAllTabs");
    const closeText = chrome.i18n.getMessage("close");
    const closeOthersText = chrome.i18n.getMessage("closeOthers");
    const closeToRightText = chrome.i18n.getMessage("closeToRight");
    const closeToLeftText = chrome.i18n.getMessage("closeToLeft");
    const closeAllText = chrome.i18n.getMessage("closeAll");

    const [saveDropdown, setSaveDropdown] = useState<{ isOpen: boolean, x: number, y: number, tabId: string } | null>(null);
    const [isOverflowOpen, setIsOverflowOpen] = useState(false);
    const [hasOverflow, setHasOverflow] = useState(false);
    const overflowRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, tabId: string } | null>(null);
    const [editingTabId, setEditingTabId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [draggedTabId, setDraggedTabId] = useState<string | null>(null);

    const handleSaveClick = (e: React.MouseEvent, tabId: string) => {
        e.stopPropagation();
        if (saveDropdown && saveDropdown.tabId === tabId) {
            setSaveDropdown(null);
            return;
        }
        const rect = e.currentTarget.getBoundingClientRect();
        setSaveDropdown({
            isOpen: true,
            x: rect.left,
            y: rect.bottom + 5,
            tabId: tabId
        });
    };

    const handleCollectionSelect = (e: React.MouseEvent, colId: string) => {
        e.stopPropagation();
        if (saveDropdown) {
            onSaveToCollection(saveDropdown.tabId, colId);
        }
        setSaveDropdown(null);
    };

    const handleContextMenu = (e: React.MouseEvent, tabId: string) => {
        e.preventDefault();
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            tabId: tabId
        });
    };

    const handleDoubleClick = (tab: TabItem) => {
        if (tab.type === 'welcome') return;
        setEditingTabId(tab.id);
        setEditValue(tab.title);
    };

    const handleRenameSubmit = () => {
        if (editingTabId && editValue.trim()) {
            onTabRename(editingTabId, editValue.trim());
        }
        setEditingTabId(null);
    };

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, tabId: string) => {
        if (editingTabId) {
            e.preventDefault();
            return;
        }
        setDraggedTabId(tabId);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', tabId);
        e.currentTarget.style.opacity = '0.5';
    };

    const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
        e.currentTarget.style.opacity = '1';
        setDraggedTabId(null);
    };

    const handleDragOver = (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        if (!draggedTabId || draggedTabId === targetId) return;

        const fromIndex = tabs.findIndex(t => t.id === draggedTabId);
        const toIndex = tabs.findIndex(t => t.id === targetId);

        if (fromIndex !== -1 && toIndex !== -1) {
            onTabReorder(fromIndex, toIndex);
        }
    };

    useEffect(() => {
        const checkOverflow = () => {
            if (scrollContainerRef.current) {
                const { scrollWidth, clientWidth } = scrollContainerRef.current;
                setHasOverflow(scrollWidth > clientWidth + 1);
            }
        };

        checkOverflow();
        window.addEventListener('resize', checkOverflow);
        return () => window.removeEventListener('resize', checkOverflow);
    }, [tabs]);

    useEffect(() => {
        if (activeTabId && scrollContainerRef.current) {
            const activeElement = document.getElementById(`tab-${activeTabId}`);
            if (activeElement) {
                activeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
        }
    }, [activeTabId]);

    useEffect(() => {
        const handleClickOutside = () => {
             setSaveDropdown(null);
             setContextMenu(null);
             setIsOverflowOpen(false);
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    const renderTabIcon = (tab: TabItem) => {
        if (tab.type === 'request') {
            return (
                <span className={`mr-2 font-bold text-[10px] ${getMethodColor(tab.method)}`}>
                    {tab.method}
                </span>
            );
        }
        if (tab.type === 'mock') {
            return (
                <svg className="w-3.5 h-3.5 mr-1.5 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
            );
        }
        return (
            <svg className="w-3.5 h-3.5 mr-1.5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
        );
    };

    return (
        <div className="flex items-end bg-slate-100 px-1 relative select-none h-10">
            <div className="absolute bottom-0 left-0 right-0 h-px bg-slate-200 z-0"></div>

            {leftSlot && (
                <div className="flex items-center self-center mr-1 relative z-20 flex-shrink-0">
                    {leftSlot}
                </div>
            )}

            <div
                ref={scrollContainerRef}
                className={`flex-1 flex overflow-x-auto no-scrollbar items-end relative z-10 h-full ${hasOverflow ? 'pr-8' : ''}`}
            >
                {tabs.map((tab, index) => (
                    <React.Fragment key={tab.id}>
                        <div 
                            id={`tab-${tab.id}`}
                            draggable={!editingTabId}
                            onDragStart={(e) => handleDragStart(e, tab.id)}
                            onDragEnd={handleDragEnd}
                            onDragOver={(e) => handleDragOver(e, tab.id)}
                            onClick={() => onTabClick(tab.id)}
                            onContextMenu={(e) => handleContextMenu(e, tab.id)}
                            onDoubleClick={() => handleDoubleClick(tab)}
                            className={`group flex items-center min-w-[140px] max-w-[210px] h-9 px-3 text-xs cursor-pointer select-none border-t border-l border-r rounded-t-md transition-colors relative flex-shrink-0
                                ${activeTabId === tab.id 
                                    ? 'bg-white border-slate-200 border-b border-b-white text-slate-800 font-semibold z-20' 
                                    : 'bg-slate-100 border-transparent border-b border-b-slate-200 hover:bg-slate-200/70 text-slate-500 z-10'}
                                ${draggedTabId === tab.id ? 'opacity-50' : ''}
                            `}
                        >
                            {renderTabIcon(tab)}
                            
                            {editingTabId === tab.id ? (
                                <input 
                                    autoFocus
                                    type="text"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onBlur={handleRenameSubmit}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleRenameSubmit();
                                        else if (e.key === 'Escape') setEditingTabId(null);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex-1 w-full bg-white border border-emerald-500 rounded px-1 py-0.5 text-xs outline-none"
                                />
                            ) : (
                                <span className="truncate flex-1" title={tab.title}>{tab.title}</span>
                            )}
                            
                            <div className={`flex items-center ml-2 space-x-1 ${activeTabId === tab.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                                {tab.type === 'request' && !tab.data?.collectionId && (
                                    <button 
                                        type="button"
                                        onClick={(e) => handleSaveClick(e, tab.id)}
                                        className="p-0.5 rounded hover:bg-emerald-100 hover:text-emerald-700 text-slate-400"
                                        title={saveToCollectionText}
                                        aria-label={saveToCollectionText}
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    </button>
                                )}

                                <button 
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); onTabClose(tab.id, e); }}
                                    className="p-0.5 rounded hover:bg-red-100 hover:text-red-600 text-slate-400"
                                    title={closeTabText}
                                    aria-label={closeTabText}
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                        </div>

                        {index < tabs.length - 1 && (
                            <div 
                                className={`w-px h-4 self-center bg-slate-300 mx-0.5 transition-opacity duration-150 flex-shrink-0
                                    ${activeTabId === tab.id || activeTabId === tabs[index + 1].id ? 'opacity-0' : 'opacity-100'}
                                `}
                            />
                        )}
                    </React.Fragment>
                ))}
            </div>

            {hasOverflow && (
                <div className="absolute right-0 top-0 bottom-0 flex items-center bg-gradient-to-l from-slate-100 via-slate-100 to-transparent pl-4 pr-1 z-20" ref={overflowRef}>
                    <button 
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setIsOverflowOpen(!isOverflowOpen); }}
                        className={`p-1.5 rounded hover:bg-slate-200 transition-colors ${isOverflowOpen ? 'bg-slate-200 text-slate-700' : 'text-slate-500'}`}
                        title={listAllTabsText}
                        aria-label={listAllTabsText}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    
                    {isOverflowOpen && (
                        <div className="absolute right-0 top-full mt-1 w-64 bg-white rounded-lg shadow-lg border border-slate-200 z-50 max-h-80 overflow-y-auto">
                            <div className="py-1">
                                {tabs.map(tab => (
                                    <div 
                                        key={tab.id}
                                        onClick={() => { onTabClick(tab.id); setIsOverflowOpen(false); }}
                                        className={`px-3.5 py-2 text-xs flex items-center cursor-pointer hover:bg-slate-50 ${activeTabId === tab.id ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'text-slate-700'}`}
                                    >
                                        {renderTabIcon(tab)}
                                        <span className="truncate">{tab.title}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {saveDropdown && (
                <div 
                    className="fixed bg-white rounded-lg shadow-xl border border-slate-200 z-[9999] py-1 w-48"
                    style={clampPosition(saveDropdown.x, saveDropdown.y, 192, 240)}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                        {saveToCollectionText}
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                        {collections.length === 0 && (
                            <div className="px-3 py-2 text-slate-400 italic text-xs">{noCollectionsText}</div>
                        )}
                        {collections.map(col => (
                            <div 
                                key={col.id}
                                onClick={(e) => handleCollectionSelect(e, col.id)}
                                className="px-3 py-2 hover:bg-emerald-50 cursor-pointer flex items-center text-slate-700 text-xs"
                            >
                                <svg className="w-3.5 h-3.5 mr-2 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v1H2V6z"/>
                                    <path d="M2 10h16v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z"/>
                                </svg>
                                <span className="truncate">{col.name}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {contextMenu && (
                <div 
                    className="fixed bg-white rounded-lg shadow-xl border border-slate-200 z-[9999] py-1 w-40"
                    style={clampPosition(contextMenu.x, contextMenu.y, 160, 200)}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button 
                        type="button"
                        className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-100"
                        onClick={() => { onTabClose(contextMenu.tabId); setContextMenu(null); }}
                    >
                        {closeText}
                    </button>
                    <button 
                        type="button"
                        className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-100"
                        onClick={() => { onTabAction('close-others', contextMenu.tabId); setContextMenu(null); }}
                    >
                        {closeOthersText}
                    </button>
                    <button 
                        type="button"
                        className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-100"
                        onClick={() => { onTabAction('close-right', contextMenu.tabId); setContextMenu(null); }}
                    >
                        {closeToRightText}
                    </button>
                    <button 
                        type="button"
                        className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-100"
                        onClick={() => { onTabAction('close-left', contextMenu.tabId); setContextMenu(null); }}
                    >
                        {closeToLeftText}
                    </button>
                    <div className="border-t border-slate-100 my-1"></div>
                    <button 
                        type="button"
                        className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50"
                        onClick={() => { onTabAction('close-all', contextMenu.tabId); setContextMenu(null); }}
                    >
                        {closeAllText}
                    </button>
                </div>
            )}
        </div>
    );
};
