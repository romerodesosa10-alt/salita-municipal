import { Route, Routes, Link, Navigate } from 'react-router-dom';
import AuthGuard from './auth/AuthGuard';
import RoleGuard, { PortalRedirect } from './auth/RoleGuard';
import Layout from './components/Layout';
import Login from './pages/Login';
import Inicio from './pages/Inicio';
import Registro from './pages/Registro';
import Dashboard from './pages/Dashboard';
import SuperAdmin from './pages/SuperAdmin';
import ClientPortal from './pages/ClientPortal';
import EntityList from './pages/EntityList';
import EntityForm, { EditEntityForm } from './pages/EntityForm';
import DetalleTurno from './pages/DetalleTurno';
export default function App() {
  return <Routes><Route index element={<Inicio/>}/><Route path="/login" element={<Login/>}/><Route path="/registro" element={<Registro/>}/><Route element={<AuthGuard/>}><Route element={<Layout/>}>
    <Route path="portal" element={<PortalRedirect/>}/>
    <Route element={<RoleGuard roles={['superadmin']}/>}><Route path="superadmin" element={<SuperAdmin/>}/></Route>
    <Route element={<RoleGuard roles={['cliente']}/>}><Route path="mi-portal" element={<ClientPortal/>}/></Route>
    <Route element={<RoleGuard roles={['admin']}/>}><Route path="admin" element={<Dashboard/>}/>{(['pacientes','medicos','consultorios'] as const).map(entity => <Route key={entity} path={entity}><Route index element={<EntityList key={entity} entity={entity}/>}/><Route path="nuevo" element={entity === 'consultorios' ? <Navigate to="/consultorios" replace/> : <EntityForm key={entity} entity={entity}/>}/>{entity !== 'pacientes' && <Route path=":id/editar" element={<EditEntityForm key={entity} entity={entity}/>}/>}</Route>)}</Route>
    <Route element={<RoleGuard roles={['admin','cliente']}/>}><Route path="turnos" element={<EntityList entity="turnos"/>}/><Route path="turnos/nuevo" element={<EntityForm entity="turnos"/>}/><Route path="turno-detalle/:id" element={<DetalleTurno/>}/></Route>
    <Route path="*" element={<div className="empty-state"><span className="eyebrow">ERROR 404</span><h1>No encontramos esta página.</h1><p>Podés volver a tu portal y continuar desde ahí.</p><Link to="/portal" className="btn btn-primary">Volver a mi portal</Link></div>}/>
  </Route></Route></Routes>;
}
