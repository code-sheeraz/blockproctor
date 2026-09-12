import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { loadModels } from './faceUtils'; // Import the loader

// ─── Auth-aware fetch wrapper ──────────────────────────────────────────────────
// All backend routes are now protected by JWT middleware. Inject the stored
// Bearer token into every request and bounce to /login on 401/403.
const originalFetch = window.fetch;

window.fetch = async (input, init = {}) => {
    const token = localStorage.getItem('token');

    const headers = new Headers(init.headers || {});
    if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    const isRelative = typeof input === 'string' && (input.startsWith('/') || input.startsWith('http://') || input.startsWith('https://'));
    void isRelative;

    const response = await originalFetch(input, { ...init, headers });

    if (response.status === 401 && !window.location.pathname.startsWith('/login')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
    }

    return response;
};
// ───────────────────────────────────────────────────────────────────────────────

// Start the app immediately, but kick off AI loading in background
const root = ReactDOM.createRoot(document.getElementById('root'));

loadModels().then(() => {
    console.log("AI Ready for App");
});

root.render(
  // Removing StrictMode helps prevent double-init bugs with face-api
  <React.Fragment> 
    <App />
  </React.Fragment>
);
