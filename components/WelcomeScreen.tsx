
import React from 'react';
import { Button } from './Button';
import { Logo } from './Logo';

interface WelcomeScreenProps {
  onCreateRequest: () => void;
  onCreateCollection: () => void;
  onImportCurl: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onCreateRequest, onCreateCollection, onImportCurl }) => {
  return (
    <div className="h-full flex flex-col items-center justify-center bg-gray-50 p-8">
      <div className="text-center max-w-2xl flex flex-col items-center">
        <div className="mb-6 p-4 bg-white rounded-2xl shadow-sm border border-green-50">
            <Logo size={64} className="text-green-600" />
        </div>
        
        <h1 className="text-3xl font-bold text-gray-800 mb-2">HTTP Debugger</h1>
        <p className="text-gray-600 mb-10 text-lg">
          Intercept, debug, and replay API requests with professional ease.
        </p>

        <div className="grid grid-cols-2 gap-4 w-full max-w-lg">
          <div 
            onClick={onCreateRequest}
            className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 cursor-pointer hover:shadow-md transition-all hover:border-green-500 group text-left"
          >
            <div className="flex items-center justify-between mb-3">
                <span className="font-bold text-gray-800">New Request</span>
                <span className="text-green-600 text-xl group-hover:scale-110 transition-transform">⚡</span>
            </div>
            <p className="text-xs text-gray-500">Start a fresh API call from scratch</p>
          </div>

          <div 
            onClick={onCreateCollection}
            className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 cursor-pointer hover:shadow-md transition-all hover:border-blue-500 group text-left"
          >
             <div className="flex items-center justify-between mb-3">
                <span className="font-bold text-gray-800">New Collection</span>
                <span className="text-blue-600 text-xl group-hover:scale-110 transition-transform">📁</span>
            </div>
            <p className="text-xs text-gray-500">Organize requests into folders</p>
          </div>

          <div 
            onClick={onImportCurl}
            className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 cursor-pointer hover:shadow-md transition-all hover:border-purple-500 group text-left"
          >
             <div className="flex items-center justify-between mb-3">
                <span className="font-bold text-gray-800">Import cURL</span>
                <span className="text-purple-600 text-xl group-hover:scale-110 transition-transform">📥</span>
            </div>
            <p className="text-xs text-gray-500">Quickly import from clipboard</p>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 opacity-60 cursor-not-allowed text-left">
             <div className="flex items-center justify-between mb-3">
                <span className="font-bold text-gray-800">Runner</span>
                <span className="text-orange-600 text-xl">🏃</span>
            </div>
            <p className="text-xs text-gray-500">Automated testing (Coming Soon)</p>
          </div>
        </div>
      </div>
    </div>
  );
};
