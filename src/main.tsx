import React from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import App from './App';
import { StoreProvider } from './store';
import { installChunkRecovery } from './components/SelfRepair';

installChunkRecovery();

createRoot(document.getElementById('root')!).render(<React.StrictMode><StoreProvider><App /></StoreProvider></React.StrictMode>);
