
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
}

export const TabBar: React.FC<TabBarProps> = ({
    tabs, activeTabId, onTabClick, onTabClose, onTabReorder, onTabRename, onTabAction, collections, onSaveToCollection
}) => {
    // 获取国际化文本
    const saveToCollectionText = chrome.i18n.getMessage("saveToCollection");
    const noCollectionsText = chrome.i18n.getMessage("noCollectionsFound");
    const closeTabText = chrome.i18n.getMessage("closeTab");
    const listAllTabsText = chrome.i18n.getMessage("listAllTabs");
    const closeText = chrome.i18n.getMessage("close");
    const closeOthersText = chrome.i18n.getMessage("closeOthers");
    const closeToRightText = chrome.i18n.getMessage("closeToRight");
    const closeToLeftText = chrome.i18n.getMessage("closeToLeft");
    const closeAllText = chrome.i18n.getMessage("closeAll");
    
    // Dropdown state for "Save to Collection"
    const [saveDropdown, setSaveDropdown] = useState<{ isOpen: boolean, x: number, y: number, tabId: string } | null>(null);

    // Overflow Dropdown State
    const [isOverflowOpen, setIsOverflowOpen] = useState(false);
    const [hasOverflow, setHasOverflow] = useState(false);
    const overflowRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, tabId: string } | null>(null);

    // Renaming State
    const [editingTabId, setEditingTabId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');

    // Drag State
    const [draggedTabId, setDraggedTabId] = useState<string | null>(null);

    // --- Actions ---

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
            onTabRename(editingTabId, editValue);
        }
        setEditingTabId(null);
    };

    // --- Drag and Drop ---

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, tabId: string) => {
        if (editingTabId) {
            e.preventDefault();
            return;
        }
        setDraggedTabId(tabId);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', tabId);
        // Make ghost image slightly transparent
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

    // --- Effects ---

    // Check overflow
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

    // Scroll active tab into view
    useEffect(() => {
        if (activeTabId && scrollContainerRef.current) {
            const activeElement = document.getElementById(`tab-${activeTabId}`);
            if (activeElement) {
                activeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
        }
    }, [activeTabId]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
             setSaveDropdown(null);
             setContextMenu(null);
             if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
                 setIsOverflowOpen(false);
             }
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    return (
        <div className="flex items-end bg-gray-100 px-1 relative select-none h-9">
            {/* Absolute border line: Acts as the bottom track. */}
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gray-200 z-0"></div>

            {/* Scrollable Area */}
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
                            className={`group flex items-center min-w-[140px] max-w-[200px] h-9 px-3 text-xs cursor-pointer select-none border-t border-l border-r rounded-t-md transition-all relative flex-shrink-0
                                ${activeTabId === tab.id 
                                    ? 'bg-white border-gray-200 border-b border-b-white text-gray-800 font-medium z-20' 
                                    : 'bg-gray-100 border-transparent border-b border-b-gray-200 hover:bg-gray-200 text-gray-500 z-10'}
                                ${draggedTabId === tab.id ? 'opacity-50' : ''}
                            `}
                        >
                            {tab.type === 'request' && (
                                <span className={`mr-2 font-bold text-[10px] ${getMethodColor(tab.method)}`}>
                                    {tab.method}
                                </span>
                            )}
                            {tab.type === 'welcome' && <span className="mr-2">🏠</span>}
                            
                            {editingTabId === tab.id ? (
                                <input 
                                    autoFocus
                                    type="text"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onBlur={handleRenameSubmit}
                                    onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit()}
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex-1 w-full bg-white border border-blue-500 rounded px-1 py-0.5 text-xs outline-none"
                                />
                            ) : (
                                <span className="truncate flex-1" title={tab.title}>{tab.title}</span>
                            )}
                            
                            {/* Action Buttons */}
                            <div className={`flex items-center ml-2 space-x-1 ${activeTabId === tab.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                                {tab.type === 'request' && !tab.data?.collectionId && (
                                    <button 
                                        onClick={(e) => handleSaveClick(e, tab.id)}
                                        className="p-0.5 rounded-full hover:bg-green-100 hover:text-green-600 text-gray-400"
                                        title={saveToCollectionText}
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    </button>
                                )}

                                <button 
                                    onClick={(e) => { e.stopPropagation(); onTabClose(tab.id, e); }}
                                    className="p-0.5 rounded-full hover:bg-red-100 hover:text-red-600 text-gray-400"
                                    title={closeTabText}
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                        </div>

                        {/* Visual Separator between tabs */}
                        {index < tabs.length - 1 && (
                            <div 
                                className={`w-px h-4 self-center bg-gray-300 mx-0.5 transition-opacity duration-150 flex-shrink-0
                                    ${activeTabId === tab.id || activeTabId === tabs[index + 1].id ? 'opacity-0' : 'opacity-100'}
                                `}
                            />
                        )}
                    </React.Fragment>
                ))}
            </div>

            {/* Overflow Menu Button */}
            {hasOverflow && (
                <div className="absolute right-0 top-0 bottom-0 flex items-center bg-gradient-to-l from-gray-100 via-gray-100 to-transparent pl-4 pr-1 z-20" ref={overflowRef}>
                    <button 
                        onClick={(e) => { e.stopPropagation(); setIsOverflowOpen(!isOverflowOpen); }}
                        className={`p-1.5 rounded hover:bg-gray-200 transition-colors ${isOverflowOpen ? 'bg-gray-200 text-gray-700' : 'text-gray-500'}`}
                        title={listAllTabsText}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    
                    {isOverflowOpen && (
                        <div className="absolute right-0 top-full mt-1 w-64 bg-white rounded-md shadow-lg border border-gray-200 z-50 max-h-80 overflow-y-auto">
                            <div className="py-1">
                                {tabs.map(tab => (
                                    <div 
                                        key={tab.id}
                                        onClick={() => { onTabClick(tab.id); setIsOverflowOpen(false); }}
                                        className={`px-4 py-2 text-xs flex items-center cursor-pointer hover:bg-gray-50 ${activeTabId === tab.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}
                                    >
                                        {tab.type === 'request' && (
                                            <span className={`w-10 font-bold mr-2 ${getMethodColor(tab.method)}`}>{tab.method}</span>
                                        )}
                                        {tab.type === 'welcome' && <span className="w-10 mr-2 text-center">🏠</span>}
                                        <span className="truncate">{tab.title}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Save Collection Dropdown */}
            {saveDropdown && (
                <div 
                    className="fixed bg-white rounded shadow-lg border border-gray-200 z-[9999] py-1 w-48"
                    style={{ top: saveDropdown.y, left: saveDropdown.x }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                        {saveToCollectionText}
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                        {collections.length === 0 && (
                            <div className="px-3 py-2 text-gray-400 italic text-xs">{noCollectionsText}</div>
                        )}
                        {collections.map(col => (
                            <div 
                                key={col.id}
                                onClick={(e) => handleCollectionSelect(e, col.id)}
                                className="px-3 py-2 hover:bg-green-50 cursor-pointer flex items-center text-gray-700 text-xs"
                            >
                                <span className="mr-2">📁</span>
                                <span className="truncate">{col.name}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Context Menu */}
            {contextMenu && (
                <div 
                    className="fixed bg-white rounded shadow-lg border border-gray-200 z-[9999] py-1 w-40"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button 
                        className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-100"
                        onClick={() => { onTabClose(contextMenu.tabId); setContextMenu(null); }}
                    >
                        {closeText}
                    </button>
                    <button 
                        className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-100"
                        onClick={() => { onTabAction('close-others', contextMenu.tabId); setContextMenu(null); }}
                    >
                        {closeOthersText}
                    </button>
                    <button 
                        className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-100"
                        onClick={() => { onTabAction('close-right', contextMenu.tabId); setContextMenu(null); }}
                    >
                        {closeToRightText}
                    </button>
                     <button 
                        className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-100"
                        onClick={() => { onTabAction('close-left', contextMenu.tabId); setContextMenu(null); }}
                    >
                        {closeToLeftText}
                    </button>
                    <div className="border-t border-gray-100 my-1"></div>
                    <button 
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
