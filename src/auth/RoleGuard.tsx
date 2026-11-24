import { Navigate, Outlet } from 'react-router-dom';
import { portalFor, type Role } from '../../shared/schemas.ts';
import { useAuth } from './AuthContext';
export default function RoleGuard({ roles }: { roles: Role[] }) { const { user } = useAuth(); return user && roles.includes(user.rol) ? <Outlet/> : <Navigate to={user ? portalFor(user.rol) : '/login'} replace/>; }
export function PortalRedirect() { const { user } = useAuth(); return <Navigate to={user ? portalFor(user.rol) : '/login'} replace/>; }
