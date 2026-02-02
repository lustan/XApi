
import React, { useState, useRef, useEffect } from 'react';
import { HttpRequest, HttpMethod } from '../types';
import { getMethodColor } from '../utils';

interface RequestHeaderProps {
    request: HttpRequest;
    onRequestChange: (req: HttpRequest) => void;
    onSend: () => void;
    isSending: boolean;
}

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];

export const RequestHeader: React.FC<RequestHeaderProps> = ({ request, onRequestChange, onSend, isSending }) => {
    const [isMethodOpen, setIsMethodOpen] = useState(false);
    const methodRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (methodRef.current && !methodRef.current.contains(event.target as Node)) {
                setIsMethodOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleMethodSelect = (m: HttpMethod) => {
        onRequestChange({ ...request, method: m });
        setIsMethodOpen(false);
    };

    // 获取国际化文本
    const enterRequestUrlText = chrome.i18n.getMessage("enterRequestUrl");
    const sendText = chrome.i18n.getMessage("send");
    const sendingText = chrome.i18n.getMessage("sending");

    return (
        <div className="border-b border-gray-200 bg-white p-2">
            <div className="flex space-x-0 shadow-sm rounded-md w-full relative">
                
                {/* Custom Method Selector */}
                <div className="relative" ref={methodRef}>
                    <button
                        onClick={() => setIsMethodOpen(!isMethodOpen)}
                        className="rounded-l-md border border-r-0 border-gray-300 px-3 py-2 text-sm font-bold bg-gray-50 hover:bg-gray-100 focus:z-10 focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 w-28 text-gray-700 flex items-center justify-between h-full transition-colors"
                    >
                        <span className={getMethodColor(request.method)}>{request.method}</span>
                        <svg className="w-4 h-4 text-gray-400 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    
                    {isMethodOpen && (
                        <div className="absolute top-full left-0 w-28 bg-white border border-gray-200 shadow-lg rounded-md z-50 py-1 mt-1 animate-fadeIn">
                            {METHODS.map(m => (
                                <div
                                    key={m}
                                    onClick={() => handleMethodSelect(m)}
                                    className="px-3 py-2 text-xs font-bold cursor-pointer hover:bg-gray-50 flex items-center justify-between transition-colors"
                                >
                                    <span className={getMethodColor(m)}>{m}</span>
                                    {request.method === m && <svg className="w-3 h-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* URL Input */}
                <input
                    type="text"
                    value={request.url}
                    onChange={(e) => onRequestChange({ ...request, url: e.target.value })}
                    placeholder={enterRequestUrlText}
                    className="flex-1 bg-gray-50 hover:bg-white focus:bg-white border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 z-0 focus:z-10 font-mono text-gray-700 min-w-0 transition-all placeholder-gray-400"
                />

                {/* Send Button */}
                <button 
                    onClick={onSend} 
                    disabled={isSending}
                    className={`rounded-r-md px-6 py-2 text-sm font-bold text-white transition-all flex items-center flex-shrink-0 shadow-sm border border-transparent ${isSending ? 'bg-green-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 hover:shadow active:bg-green-800'}`}
                >
                    {isSending ? sendingText : sendText}
                </button>
            </div>
        </div>
    );
};
