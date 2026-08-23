import React from 'react';
import { createRoot } from 'react-dom/client';
import ZJobsDemo from './ZJobsDemo.jsx';

const root = document.getElementById('root');
if (!root) throw new Error('Z Jobs Web: missing #root mount point');

createRoot(root).render(
  <React.StrictMode>
    <ZJobsDemo />
  </React.StrictMode>,
);
