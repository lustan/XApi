import React, { useRef, useState } from 'react';
import { Modal } from './Modal';
import { parseCurl } from '../utils';
import { parseUniversalImportJson, ImportParseResult } from '../importExportUtils';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportCurl: (curlText: string) => boolean;
  onImportStructured: (result: Exclude<ImportParseResult, { kind: 'error' }>) => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  onImportCurl,
  onImportStructured,
}) => {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleConfirm = () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    if (trimmed.toLowerCase().startsWith('curl')) {
      const ok = onImportCurl(trimmed);
      if (ok) {
        setInput('');
        setError(null);
        onClose();
      } else {
        setError(chrome.i18n.getMessage('invalidCurl') || 'Invalid cURL command');
      }
      return;
    }

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      const parsed = parseUniversalImportJson(trimmed);
      if (parsed.kind === 'error') {
        setError(parsed.message);
      } else {
        onImportStructured(parsed);
        setInput('');
        setError(null);
        onClose();
      }
      return;
    }

    // Last attempt as cURL fallback
    if (parseCurl(trimmed) && onImportCurl(trimmed)) {
      setInput('');
      setError(null);
      onClose();
      return;
    }

    setError(
      chrome.i18n.getMessage('importInvalidError') ||
        'Please paste a valid cURL command, Postman v2.1, OpenAPI / Swagger JSON, or XApi backup JSON.'
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setInput(String(reader.result || ''));
      setError(null);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { setError(null); onClose(); }}
      title={chrome.i18n.getMessage('importUniversal') || 'Import'}
      onConfirm={handleConfirm}
      confirmText={chrome.i18n.getMessage('import') || 'Import'}
      confirmDisabled={!input.trim()}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            {chrome.i18n.getMessage('importUniversalDesc') ||
              'Paste or upload cURL, Postman v2.1, OpenAPI / Swagger, or XApi JSON backup.'}
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".json,.txt,application/json"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 whitespace-nowrap flex-shrink-0 transition-colors"
          >
            {chrome.i18n.getMessage('uploadJsonFile') || 'Upload .json file'}
          </button>
        </div>

        <textarea
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            if (error) setError(null);
          }}
          className={`w-full h-44 border rounded-md p-3 font-mono text-xs focus:outline-none bg-slate-50 focus:bg-white transition-colors ${
            error ? 'border-red-300 focus:border-red-500' : 'border-slate-300 focus:border-emerald-500'
          }`}
          placeholder="curl 'https://api.example.com' ... or { &quot;openapi&quot;: &quot;3.0.0&quot;, ... }"
        />
        {error && <div className="text-xs text-red-600">{error}</div>}
      </div>
    </Modal>
  );
};
