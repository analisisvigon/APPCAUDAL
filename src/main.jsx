import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { registerAppServiceWorker } from './pwa/registerPwa';
import { PDF_GENERATOR_LOAD_ERROR_MESSAGE, recoverFromStaleChunkOnce } from './utils/pwaChunkRecovery';
import './index.css';

registerAppServiceWorker();

const recoverGlobalChunkFailure = async (error, event) => {
  const recovery = await recoverFromStaleChunkOnce(error);
  if (!recovery.handled) return;
  event?.preventDefault?.();
  if (!recovery.reloadRequested) {
    window.dispatchEvent(new CustomEvent('appcaudal:chunk-load-failed', {
      detail: { message: PDF_GENERATOR_LOAD_ERROR_MESSAGE },
    }));
  }
};

window.addEventListener('error', (event) => {
  recoverGlobalChunkFailure(event.error || event.message, event);
});

window.addEventListener('unhandledrejection', (event) => {
  recoverGlobalChunkFailure(event.reason, event);
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
