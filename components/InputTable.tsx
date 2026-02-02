
import React, { useState, useRef, useEffect } from 'react';
import { KeyValue } from '../types';
import { generateId } from '../utils';

interface InputTableProps {
  items: KeyValue[];
  onChange: (items: KeyValue[]) => void;
  title?: string;
  hideTitle?: boolean;
  withTypeSelector?: boolean; // New prop to control visibility of the Text/File dropdown
}

// Sub-component for individual rows to manage dropdown state independently
const InputTableRow: React.FC<{
    item: KeyValue;
    onChange: (id: string, field: keyof KeyValue, val: any) => void;
    onFileChange: (id: string, file: File | null) => void;
    onRemove: (id: string) => void;
    onToggle: (id: string) => void;
    isLast: boolean;
    withTypeSelector: boolean;
    showRemoveButton: boolean;
}> = ({ item, onChange, onFileChange, onRemove, onToggle, isLast, withTypeSelector, showRemoveButton }) => {
    const [isTypeOpen, setIsTypeOpen] = useState(false);
    const typeRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (typeRef.current && !typeRef.current.contains(event.target as Node)) {
                setIsTypeOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleTypeSelect = (type: 'text' | 'file') => {
        onChange(item.id, 'type', type);
        setIsTypeOpen(false);
    };

    // 获取国际化文本
    const keyText = chrome.i18n.getMessage("key");
    const valueText = chrome.i18n.getMessage("value");
    const textText = chrome.i18n.getMessage("text");
    const fileText = chrome.i18n.getMessage("file");
    const removeText = chrome.i18n.getMessage("remove");

    return (
        <div className="flex items-start mb-1 group">
          <div className="w-8 flex justify-center pt-2">
            <input 
              type="checkbox" 
              checked={item.enabled} 
              onChange={() => onToggle(item.id)}
              className="rounded text-green-600 focus:ring-green-500 cursor-pointer"
            />
          </div>
          <div className="flex-1 px-1 relative">
            <input 
              type="text" 
              value={item.key} 
              placeholder={keyText}
              onChange={(e) => onChange(item.id, 'key', e.target.value)}
              className="w-full bg-gray-50 hover:bg-gray-100 focus:bg-white border border-transparent hover:border-gray-300 focus:border-green-500 rounded px-2 py-1.5 text-sm focus:outline-none transition-all placeholder-gray-400"
            />
          </div>
          <div className="flex-1 px-1 relative flex space-x-1">
             {/* Value Input or File Input */}
             {item.type === 'file' && withTypeSelector ? (
                 <div className="flex-1 relative">
                    <input 
                        type="file"
                        onChange={(e) => onFileChange(item.id, e.target.files ? e.target.files[0] : null)}
                        className="w-full text-xs text-gray-500 border border-gray-300 rounded py-1 px-1 bg-white"
                    />
                 </div>
             ) : (
                <input 
                    type="text" 
                    value={item.value} 
                    placeholder={valueText}
                    onChange={(e) => onChange(item.id, 'value', e.target.value)}
                    className="w-full bg-gray-50 hover:bg-gray-100 focus:bg-white border border-transparent hover:border-gray-300 focus:border-green-500 rounded px-2 py-1.5 text-sm focus:outline-none transition-all placeholder-gray-400"
                />
             )}
             
             {/* Custom Type Selector Dropdown */}
             {withTypeSelector && (
                 <div className="relative w-[70px] flex-shrink-0" ref={typeRef}>
                     <button 
                        onClick={() => setIsTypeOpen(!isTypeOpen)}
                        className="w-full h-full bg-gray-50 hover:bg-gray-100 border border-transparent hover:border-gray-300 rounded px-2 flex items-center justify-between focus:border-green-500 transition-colors text-[10px] text-gray-600 font-medium"
                     >
                         <span>{item.type === 'file' ? fileText : textText}</span>
                         <svg className={`fill-current h-2 w-2 text-gray-400 transform transition-transform ${isTypeOpen ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                     </button>

                     {isTypeOpen && (
                         <div className="absolute right-0 top-full mt-1 w-20 bg-white border border-gray-200 shadow-lg rounded z-50 py-1 flex flex-col animate-fadeIn">
                            <button 
                                onClick={() => handleTypeSelect('text')} 
                                className={`text-left px-3 py-1.5 text-[10px] hover:bg-green-50 hover:text-green-700 ${item.type !== 'file' ? 'text-green-600 font-bold' : 'text-gray-700'}`}
                            >
                                {textText}
                            </button>
                            <button 
                                onClick={() => handleTypeSelect('file')} 
                                className={`text-left px-3 py-1.5 text-[10px] hover:bg-green-50 hover:text-green-700 ${item.type === 'file' ? 'text-green-600 font-bold' : 'text-gray-700'}`}
                            >
                                {fileText}
                            </button>
                         </div>
                     )}
                 </div>
             )}
          </div>
          <div className="w-8 flex justify-center pt-2">
            {showRemoveButton && (
                <button 
                onClick={() => onRemove(item.id)} 
                className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                title={removeText}
                >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            )}
          </div>
        </div>
    );
};

export const InputTable: React.FC<InputTableProps> = ({ items, onChange, title, hideTitle, withTypeSelector = false }) => {
  
  React.useEffect(() => {
    if (items.length === 0) {
      onChange([{ id: generateId(), key: '', value: '', enabled: true, type: 'text' }]);
    }
  }, [items.length]);

  const handleChange = (id: string, field: keyof KeyValue, val: any) => {
    const newItems = items.map(item => 
      item.id === id ? { ...item, [field]: val } : item
    );
    
    const lastItem = newItems[newItems.length - 1];
    if (lastItem.id === id && (val !== '')) {
       newItems.push({ id: generateId(), key: '', value: '', enabled: true, type: 'text' });
    }
    
    onChange(newItems);
  };

  const handleFileChange = (id: string, file: File | null) => {
      const newItems = items.map(item => 
        item.id === id ? { ...item, value: file ? file.name : '', file: file || undefined } : item
      );
      onChange(newItems);
  };

  const handleRemove = (id: string) => {
    if (items.length <= 1) {
        onChange([{ id: generateId(), key: '', value: '', enabled: true, type: 'text' }]);
        return;
    }
    onChange(items.filter(i => i.id !== id));
  };

  const handleToggle = (id: string) => {
    onChange(items.map(i => i.id === id ? { ...i, enabled: !i.enabled } : i));
  };

  const handleManualAdd = () => {
    onChange([...items, { id: generateId(), key: '', value: '', enabled: true, type: 'text' }]);
  };

  // 获取国际化文本
  const keyText = chrome.i18n.getMessage("key");
  const valueText = chrome.i18n.getMessage("value");
  const addItemText = chrome.i18n.getMessage("addItem");

  return (
    <div className="w-full flex flex-col">
      {!hideTitle && title && <div className="text-sm font-bold text-gray-700 mb-2">{title}</div>}
      
      {/* Header */}
      <div className="flex border-b border-gray-200 pb-1 mb-1 text-xs font-semibold text-gray-500">
        <div className="w-8 text-center"></div>
        <div className="flex-1 px-1">{keyText}</div>
        <div className="flex-1 px-1">{valueText}</div>
        <div className="w-8"></div>
      </div>

      {/* Rows */}
      {items.map((item, index) => (
        <InputTableRow
            key={item.id}
            item={item}
            onChange={handleChange}
            onFileChange={handleFileChange}
            onRemove={handleRemove}
            onToggle={handleToggle}
            isLast={index === items.length - 1}
            withTypeSelector={withTypeSelector}
            showRemoveButton={items.length > 1 || !!item.key || !!item.value}
        />
      ))}

      <div className="mt-2 px-1">
          <button 
            onClick={handleManualAdd}
            className="text-xs font-medium text-gray-500 hover:text-green-600 flex items-center transition-colors"
          >
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              {addItemText}
          </button>
      </div>
    </div>
  );
};
