import Logo from './Logo';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Building2, ShieldCheck, CalendarDays, DoorOpen, LayoutDashboard, LogOut, Menu, Stethoscope, Users, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../auth/AuthContext';
const adminLinks = [{ to: '/admin', label: 'Resumen', icon: LayoutDashboard }, { to: '/turnos', label: 'Turnos', icon: CalendarDays }, { to: '/pacientes', label: 'Pacientes', icon: Users }, { to: '/medicos', label: 'Médicos', icon: Stethoscope }, { to: '/consultorios', label: 'Consultorios', icon: DoorOpen }];
export default function Layout() {
  const { user, logout } = useAuth(); const [open, setOpen] = useState(false); const [leaving, setLeaving] = useState(false); const { pathname } = useLocation();
  const roleLabel = user?.rol === 'superadmin' ? 'Superadministrador' : user?.rol === 'admin' ? 'Administrador de salita' : 'Paciente';
  const links = user?.rol === 'superadmin' ? [{ to: '/superadmin', label: 'Salitas y administradores', icon: Building2 }] : user?.rol === 'cliente' ? [{ to: '/mi-portal', label: 'Mi portal', icon: LayoutDashboard }, { to: '/turnos', label: 'Mis turnos', icon: CalendarDays }] : adminLinks;
  const current = links.find(x => x.to !== '/' && pathname.startsWith(x.to))?.label || 'Resumen';
  return <div className="app-shell"><a className="skip-link" href="#contenido">Saltar al contenido</a><aside className={`sidebar ${open ? 'is-open' : ''}`}>
    <Link to="/portal" className="brand" onClick={() => setOpen(false)}><Logo/></Link>
    <div className="nav-caption">{user?.rol === 'superadmin' ? 'GESTIÓN GLOBAL' : user?.salitaNombre || 'MI ESPACIO'}</div><nav aria-label="Navegación principal">{links.map(({ to, label, icon: Icon }) => <NavLink key={to} end={to === '/admin' || to === '/mi-portal'} to={to} onClick={() => setOpen(false)}><Icon size={19} /><span>{label}</span></NavLink>)}</nav>
    <div className="sidebar-bottom"><div className="care-note"><span className="status-dot" /> Atención organizada.<br /><span>Cuidamos cada encuentro.</span></div><div className="user-card"><div className="avatar"><ShieldCheck size={17}/></div><div><strong>{user?.nombre}</strong><span>{roleLabel}</span></div><button className="icon-button" aria-label="Cerrar sesión" disabled={leaving} onClick={async () => { setLeaving(true); try { await logout(); } catch { toast.info('Se cerró la sesión en este navegador.'); } finally { setLeaving(false); } }}><LogOut size={18} /></button></div></div>
  </aside>{open && <button className="nav-backdrop" aria-label="Cerrar menú" onClick={() => setOpen(false)} />}
  <div className="workspace"><header className="topbar"><div className="breadcrumb"><button className="mobile-menu icon-button" aria-label={open ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button><span>Gestión de atención</span><span className="crumb-separator">/</span><strong>{current}</strong><span className="role-chip">{roleLabel}</span></div><div className="topbar-date"><span className="status-dot" />{new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}</div></header><main id="contenido" className="main-content"><Outlet /></main><footer>SALITA MUNICIPAL <span>Una mejor atención empieza con una buena organización.</span></footer></div></div>;
}
