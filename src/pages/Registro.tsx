import Logo from '../components/Logo';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useFetch } from '../hooks/useFetch';
import { portalFor, type Salita } from '../../shared/schemas.ts';
import AccountForm from '../components/AccountForm';
import { Empty, ErrorNotice, Loading } from '../components/Feedback';
export default function Registro() {
  const { user, register } = useAuth(); const { data, isLoading, error, refetch } = useFetch<Salita[]>('/salitas/publicas');
  if (user) return <Navigate to={portalFor(user.rol)} replace/>;
  return <main className="registration-page"><Link to="/login" className="brand"><Logo/></Link><section className="form-card registration-card"><Link to="/login" className="back-link"><ArrowLeft size={16}/> Volver al ingreso</Link><span className="eyebrow">PORTAL DE PACIENTES</span><h1>Creá tu cuenta</h1><p className="muted">Elegí tu salita para consultar y solicitar tus turnos.</p>{isLoading ? <Loading label="Cargando salitas…"/> : error ? <ErrorNotice message={error} retry={refetch}/> : !data?.length ? <Empty title="Todavía no hay salitas disponibles." text="Consultá a la administración antes de registrarte."/> : <AccountForm mode="registro" salitas={data} submit={register}/>}<p className="account-note">¿Ya tenés cuenta? <Link to="/login">Iniciá sesión</Link></p></section></main>;
}
