import React, { useState } from 'react';
import { EnvironmentItem, EnvironmentVariable } from '../types';
import { createEnvironment } from '../envUtils';
import { generateId } from '../utils';

interface EnvManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  environments: EnvironmentItem[];
  activeEnvironmentId: string | null;
  onSaveEnvironments: (envs: EnvironmentItem[], activeId: string | null) => void;
}

const t = (key: string, fallback: string) => chrome.i18n.getMessage(key) || fallback;

export const EnvManagerModal: React.FC<EnvManagerModalProps> = ({
  isOpen,
  onClose,
  environments,
  activeEnvironmentId,
  onSaveEnvironments,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(activeEnvironmentId || environments[0]?.id || null);

  if (!isOpen) return null;

  const currentSelectedId = environments.some((e) => e.id === selectedId)
    ? selectedId
    : environments[0]?.id || null;
  const currentEnv = environments.find((e) => e.id === currentSelectedId) || null;

  const addEnv = () => {
    const nextEnv = createEnvironment(`${t('envDefaultPrefix', 'Env')} ${environments.length + 1}`);
    const next = [...environments, nextEnv];
    setSelectedId(nextEnv.id);
    onSaveEnvironments(next, activeEnvironmentId || nextEnv.id);
  };

  const deleteEnv = (id: string) => {
    const next = environments.filter((e) => e.id !== id);
    const nextActive = activeEnvironmentId === id ? (next[0]?.id || null) : activeEnvironmentId;
    setSelectedId(next[0]?.id || null);
    onSaveEnvironments(next, nextActive);
  };

  const updateEnv = (id: string, patch: Partial<EnvironmentItem>) => {
    const next = environments.map((e) => (e.id === id ? { ...e, ...patch } : e));
    onSaveEnvironments(next, activeEnvironmentId);
  };

  const updateVar = (envId: string, varId: string, patch: Partial<EnvironmentVariable>) => {
    const target = environments.find((e) => e.id === envId);
    if (!target) return;
    updateEnv(envId, {
      variables: target.variables.map((v) => (v.id === varId ? { ...v, ...patch } : v)),
    });
  };

  const addVar = (envId: string) => {
    const target = environments.find((e) => e.id === envId);
    if (!target) return;
    updateEnv(envId, {
      variables: [...target.variables, { id: generateId(), key: '', value: '', enabled: true }],
    });
  };

  const removeVar = (envId: string, varId: string) => {
    const target = environments.find((e) => e.id === envId);
    if (!target) return;
    updateEnv(envId, {
      variables: target.variables.filter((v) => v.id !== varId),
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[1px] animate-fadeIn p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('environmentsTitle', 'Environments')}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-2xl h-[460px] flex flex-col overflow-hidden"
      >
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{t('environmentsTitle', 'Environments')}</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {t('environmentsHintPrefix', 'Use')} <code className="font-mono text-emerald-700">{'{{variable}}'}</code> {t('environmentsHintSuffix', 'inside URLs, Headers, Params, and Body.')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close', 'Close')}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 flex min-h-0">
          {/* Left Environment List */}
          <div className="w-48 border-r border-slate-200 bg-slate-50 flex flex-col flex-shrink-0">
            <div className="p-2.5 border-b border-slate-200">
              <button
                type="button"
                onClick={addEnv}
                className="w-full px-2.5 py-1.5 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-1 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>{t('newEnvironment', 'New Environment')}</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
              {environments.length === 0 ? (
                <div className="text-[11px] text-slate-400 text-center py-6 px-2">
                  {t('noEnvironmentsYet', 'No environments yet.')}
                </div>
              ) : (
                environments.map((env) => {
                  const isSel = currentEnv?.id === env.id;
                  const isActive = activeEnvironmentId === env.id;
                  return (
                    <div
                      key={env.id}
                      onClick={() => setSelectedId(env.id)}
                      className={`group flex items-center justify-between px-2.5 py-2 rounded-md cursor-pointer text-xs transition-colors ${
                        isSel ? 'bg-white text-emerald-700 font-semibold border border-emerald-200 shadow-sm' : 'text-slate-700 hover:bg-slate-200/60'
                      }`}
                    >
                      <span className="truncate flex items-center gap-1.5">
                        {isActive && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 flex-shrink-0" />}
                        <span className="truncate">{env.name}</span>
                      </span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); deleteEnv(env.id); }}
                        aria-label={`${t('delete', 'Delete')} ${env.name}`}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 p-0.5"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Variable Editor */}
          <div className="flex-1 flex flex-col min-w-0 bg-white">
            {currentEnv ? (
              <>
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
                  <input
                    type="text"
                    value={currentEnv.name}
                    onChange={(e) => updateEnv(currentEnv.id, { name: e.target.value })}
                    aria-label={t('environmentNameLabel', 'Environment name')}
                    className="text-sm font-semibold text-slate-800 border border-slate-200 focus:border-emerald-500 rounded-md px-2.5 py-1 focus:outline-none flex-1"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      onSaveEnvironments(
                        environments,
                        activeEnvironmentId === currentEnv.id ? null : currentEnv.id
                      )
                    }
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                      activeEnvironmentId === currentEnv.id
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200'
                    }`}
                  >
                    {activeEnvironmentId === currentEnv.id ? t('envActive', 'Active') : t('envSetActive', 'Set Active')}
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  <div className="border border-slate-200 rounded-md overflow-hidden">
                    <div className="flex bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2.5 py-1.5 border-b border-slate-200">
                      <div className="w-7" />
                      <div className="w-[40%] pr-2">{t('variableName', 'Variable')}</div>
                      <div className="flex-1">{t('value', 'Value')}</div>
                      <div className="w-7" />
                    </div>
                    {currentEnv.variables.map((v) => (
                      <div key={v.id} className="flex items-center px-2.5 py-1.5 border-b border-slate-100 last:border-b-0 group">
                        <div className="w-7 flex justify-center">
                          <input
                            type="checkbox"
                            checked={v.enabled}
                            onChange={(e) => updateVar(currentEnv.id, v.id, { enabled: e.target.checked })}
                            className="accent-emerald-600 cursor-pointer"
                          />
                        </div>
                        <div className="w-[40%] pr-2">
                          <input
                            type="text"
                            value={v.key}
                            onChange={(e) => updateVar(currentEnv.id, v.id, { key: e.target.value })}
                            placeholder="baseUrl"
                            className="w-full text-xs font-mono border border-transparent hover:border-slate-200 focus:border-emerald-500 rounded px-2 py-1 focus:outline-none"
                          />
                        </div>
                        <div className="flex-1 pr-2">
                          <input
                            type="text"
                            value={v.value}
                            onChange={(e) => updateVar(currentEnv.id, v.id, { value: e.target.value })}
                            placeholder="https://api.example.com"
                            className="w-full text-xs font-mono border border-transparent hover:border-slate-200 focus:border-emerald-500 rounded px-2 py-1 focus:outline-none"
                          />
                        </div>
                        <div className="w-7 flex justify-center">
                          <button
                            type="button"
                            onClick={() => removeVar(currentEnv.id, v.id)}
                            aria-label={t('delete', 'Delete')}
                            className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => addVar(currentEnv.id)}
                    className="mt-2.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center"
                  >
                    <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    {t('addVariable', 'Add Variable')}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-xs p-6 text-center">
                <p className="mb-3">{t('environmentsEmptyDesc', 'Create an environment to store reusable URLs, tokens, and IDs.')}</p>
                <button
                  type="button"
                  onClick={addEnv}
                  className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                >
                  {t('newEnvironment', 'New Environment')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
