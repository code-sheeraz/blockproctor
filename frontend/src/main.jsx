import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { loadModels } from './faceUtils'; // Import the loader

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