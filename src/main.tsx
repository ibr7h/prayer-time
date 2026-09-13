import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { startNativePrayerScheduler } from './nativeScheduler';
import './style.css';

startNativePrayerScheduler();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
