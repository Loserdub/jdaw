import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

console.info(
  '%c J-DAW %c Created by Justin Ray • https://trustnodelogic.com ',
  'background: #f59e0b; color: #000; font-weight: bold; padding: 3px 6px; border-radius: 4px 0 0 4px;',
  'background: #18181b; color: #f59e0b; padding: 3px 6px; border-radius: 0 4px 4px 0; border: 1px solid rgba(245,158,11,0.3);'
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
