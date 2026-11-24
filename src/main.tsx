import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import 'bootstrap/dist/css/bootstrap.min.css';
import './styles.css';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><AuthProvider><App/><Toaster richColors closeButton position="top-right"/></AuthProvider></BrowserRouter></React.StrictMode>);
