import React, { useEffect } from 'react';
import { Button } from './Button';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  onConfirm?: () => void;
  confirmText?: string;
  confirmVariant?: 'primary' | 'danger';
  confirmDisabled?: boolean;
}

export const Modal: React.FC<ModalProps> = ({ 
  isOpen, onClose, title, children, onConfirm, confirmText, confirmVariant = 'primary', confirmDisabled = false 
}) => {
  const confirmTextDefault = chrome.i18n.getMessage("confirm");
  const cancelText = chrome.i18n.getMessage("cancel");

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[1px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg mx-4 flex flex-col max-h-[90vh] animate-fadeIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-5 py-3.5 border-b border-slate-200">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={cancelText || 'Close'}
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1">
          {children}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50/60 rounded-b-xl flex justify-end space-x-2">
          <Button variant="secondary" onClick={onClose}>{cancelText}</Button>
          {onConfirm && (
            <Button variant={confirmVariant} onClick={onConfirm} disabled={confirmDisabled}>
              {confirmText || confirmTextDefault}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
