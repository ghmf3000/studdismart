// index.tsx
import "./services/firebase"; // ✅ ensures firebase/auth registers before anything uses auth
import "./index.css"; // ✅ Fixes 404 in production builds
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);