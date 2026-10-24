import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';

import RoutesComponent from './app.tsx';
import './index.css';
import { createPortal } from 'react-dom';
import { Toaster } from '@client/src/components/ui/sonner';
import { isStandaloneRuntime } from './lib/runtime';

const configuredBasePath = process.env.CLIENT_BASE_PATH || '/';
const CLIENT_BASE_PATH = isStandaloneRuntime() ? '/' : configuredBasePath;

declare global {
  interface Window {
    __READING_CLASSROOM_ROOT__?: Root;
  }
}

const MainApp = () => {
  const content = (
    <ErrorBoundary
      fallbackRender={({ error, resetErrorBoundary }) => (
        <main className="app-loading" role="alert">
          <span>叶</span>
          <p>页面暂时无法打开：{String(error?.message || error)}</p>
          <button type="button" onClick={resetErrorBoundary}>重新打开</button>
        </main>
      )}
    >
      <RoutesComponent />
      {createPortal(<Toaster />, document.body)}
    </ErrorBoundary>
  );

  return (
    <BrowserRouter basename={CLIENT_BASE_PATH}>
      {content}
    </BrowserRouter>
  );
};

window.__READING_CLASSROOM_ROOT__ ??= createRoot(document.getElementById('root')!);
window.__READING_CLASSROOM_ROOT__.render(<MainApp />);
