import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AuthPage from './pages/AuthPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import DashboardPage from './pages/DashboardPage';
import ActivitiesPage from './pages/ActivitiesPage';
import ProfilePage from './pages/ProfilePage';
import MLPage from './pages/MLPage';
import RoutesPage from './pages/RoutesPage';
import MyRoutesPage from './pages/MyRoutesPage';
import { CrashBoundary } from './components/CrashBoundary';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('No se ha encontrado el elemento #root del frontend.');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <CrashBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AuthPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/actividades" element={<ActivitiesPage />} />
          <Route path="/actividades/:activityId" element={<ActivitiesPage />} />
          <Route path="/perfil" element={<ProfilePage />} />
          <Route path="/ia" element={<MLPage />} />
          <Route path="/rutas" element={<RoutesPage />} />
          <Route path="/mis-rutas" element={<MyRoutesPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </CrashBoundary>
  </React.StrictMode>
);
