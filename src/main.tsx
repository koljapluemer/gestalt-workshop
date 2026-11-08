import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { installGlobalCapture } from '@gestalts/view';
import { App } from './App';
import './app.css';

installGlobalCapture();
createRoot(document.getElementById('app')!).render(<StrictMode><App /></StrictMode>);
