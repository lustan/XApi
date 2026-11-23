import React from 'react';
import { Logo } from './Logo';

interface WelcomeScreenProps {
  onCreateRequest: () => void;
  onCreateCollection: () => void;
  onImportCurl: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onCreateRequest,
  onCreateCollection,
  onImportCurl,
}) => {
  const welcomeSubtitle = chrome.i18n.getMessage("welcomeSubtitle");
  const newRequestText = chrome.i18n.getMessage("newRequest");
  const newRequestDesc = chrome.i18n.getMessage("newRequestDesc");
  const newCollectionText = chrome.i18n.getMessage("newCollection");
  const newCollectionDesc = chrome.i18n.getMessage("newCollectionDesc");
  const importCurlText = chrome.i18n.getMessage("importCurl");
  const importCurlDesc = chrome.i18n.getMessage("importCurlDesc");

  return (
    <div className="h-full flex flex-col items-center justify-center bg-slate-50/70 p-8 overflow-y-auto">
      <div className="text-center max-w-2xl w-full flex flex-col items-center">
        <div className="mb-5">
          <Logo size={56} showText={false} />
        </div>

        <h1 className="text-3xl font-extrabold text-slate-900 mb-2 tracking-tight">
          X<span className="font-semibold text-emerald-600">Api</span>
        </h1>
        <p className="text-slate-500 mb-9 text-sm max-w-md leading-relaxed">
          {welcomeSubtitle}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl">
          <button
            type="button"
            onClick={onCreateRequest}
            className="bg-white p-5 rounded-xl border border-slate-200 cursor-pointer hover:border-emerald-500 hover:shadow-sm transition-all group text-left flex flex-col items-start justify-start focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3.5 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div className="font-semibold text-sm text-slate-800 mb-1">{newRequestText}</div>
            <p className="text-xs text-slate-500 leading-relaxed">{newRequestDesc}</p>
          </button>

          <button
            type="button"
            onClick={onCreateCollection}
            className="bg-white p-5 rounded-xl border border-slate-200 cursor-pointer hover:border-emerald-500 hover:shadow-sm transition-all group text-left flex flex-col items-start justify-start focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center mb-3.5 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
            <div className="font-semibold text-sm text-slate-800 mb-1">{newCollectionText}</div>
            <p className="text-xs text-slate-500 leading-relaxed">{newCollectionDesc}</p>
          </button>

          <button
            type="button"
            onClick={onImportCurl}
            className="bg-white p-5 rounded-xl border border-slate-200 cursor-pointer hover:border-emerald-500 hover:shadow-sm transition-all group text-left flex flex-col items-start justify-start focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center mb-3.5 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
            <div className="font-semibold text-sm text-slate-800 mb-1">{importCurlText}</div>
            <p className="text-xs text-slate-500 leading-relaxed">{importCurlDesc}</p>
          </button>
        </div>
      </div>
    </div>
  );
};
