import React from 'react';
import { Button } from './Button';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  onConfirm?: () => void;
  confirmText?: string;
  confirmDisabled?: boolean;
}

export const Modal: React.FC<ModalProps> = ({ 
  isOpen, onClose, title, children, onConfirm, confirmText, confirmDisabled = false 
}) => {
  // 获取国际化文本
  const confirmTextDefault = chrome.i18n.getMessage("confirm");
  const cancelText = chrome.i18n.getMessage("cancel");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        
        {/* Body */}
        <div className="p-4 overflow-y-auto flex-1">
          {children}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 flex justify-end space-x-2">
          <Button variant="secondary" onClick={onClose}>{cancelText}</Button>
          {onConfirm && (
            <Button onClick={onConfirm} disabled={confirmDisabled}>{confirmText || confirmTextDefault}</Button>
          )}
        </div>
      </div>
    </div>
  );
};
