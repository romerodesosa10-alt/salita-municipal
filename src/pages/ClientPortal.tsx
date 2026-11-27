import { BookingCountdown, useBookingCountdown } from '../components/BookingCountdown';
import BackLink from '../components/BackLink';
import { Link } from 'react-router-dom';
import { CalendarDays, Plus, UserRound } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useFetch } from '../hooks/useFetch';
import type { ITurno } from '../../shared/schemas.ts';
import TurnoCard from '../components/TurnoCard';
import { Empty, ErrorNotice, Skeletons } from '../components/Feedback';
export default function ClientPortal() {
  const { user } = useAuth(); const { data, isLoading, error, refetch } = useFetch<ITurno[]>('/turnos');
  const seconds = useBookingCountdown();
  return <><BackLink to="/"/><div className="page-heading"><div><span className="eyebrow">MI PORTAL</span><h1>Hola, {user?.nombre}.</h1><p>Tus turnos y tu atención en {user?.salitaNombre}.</p></div>{seconds === 0 && <Link to="/turnos/nuevo" className="btn btn-primary"><Plus size={18}/> Solicitar turno</Link>}</div>{seconds > 0 && <BookingCountdown seconds={seconds}/>}<section className="welcome-banner"><div><span className="banner-kicker"><UserRound size={15}/> TU CUENTA PERSONAL</span><h2>Tu próxima atención,<br/>más cerca.</h2><p>Desde acá podés solicitar turnos y consultar tus próximos encuentros.</p></div><CalendarDays size={95} strokeWidth={1} className="client-calendar"/></section><section className="list-panel"><div className="panel-heading"><h2>Mis turnos</h2><span className="count-pill">{data?.length || 0}</span></div>{isLoading ? <Skeletons/> : error ? <ErrorNotice message={error} retry={refetch}/> : !data?.length ? <Empty title="Todavía no tenés turnos." text="Usá “Solicitar turno” para reservar tu primera atención."/> : <div className="records-grid">{[...data].sort((a, b) => Date.parse(b.fechaTurno) - Date.parse(a.fechaTurno)).map(t => <TurnoCard key={t.id} turno={t} onCancelled={refetch}/>)}</div>}</section></>;
}
