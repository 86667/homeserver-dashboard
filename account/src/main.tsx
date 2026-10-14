import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AccountFlow } from './components/AccountFlow';
import { loadConfig } from './config';
import './index.css';

const config = await loadConfig();
// An invite link carries its code as ?token=.
const initialCode = new URLSearchParams(window.location.search).get('token') ?? '';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AccountFlow config={config} initialCode={initialCode} />
  </StrictMode>,
);
