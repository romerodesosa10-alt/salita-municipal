import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { Loading } from '../components/Feedback';
export default function AuthGuard() { const { user, checking } = useAuth(); const location = useLocation(); if (checking) return <Loading label="Comprobando sesión…" />; return user ? <Outlet /> : <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />; }
