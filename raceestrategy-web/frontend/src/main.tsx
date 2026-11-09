import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import ActivitiesPage from './pages/ActivitiesPage';
import ProfilePage from './pages/ProfilePage';
import MLPage from './pages/MLPage';
import { CrashBoundary } from './components/CrashBoundary';
import './styles.css';
import RoutesPage from './pages/RoutesPage';
import MyRoutesPage from './pages/MyRoutesPage';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('No se ha encontrado el elemento #root del frontend.');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <CrashBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AuthPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/actividades" element={<ActivitiesPage />} />
          <Route path="/actividades/:activityId" element={<ActivitiesPage />} />
          <Route path="/perfil" element={<ProfilePage />} />
          <Route path="/ia" element={<MLPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
          <Route path="/rutas" element={<RoutesPage />} />`n          <Route path="/mis-rutas" element={<MyRoutesPage />} />
        </Routes>
      </BrowserRouter>
    </CrashBoundary>
  </React.StrictMode>
);
