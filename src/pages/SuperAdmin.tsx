import BackLink from '../components/BackLink';
import { Building2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useFetch } from '../hooks/useFetch';
import { api } from '../lib/api';
import type { Administrador, ApiResponse, Salita } from '../../shared/schemas.ts';
import Administradores from '../components/Administradores';
import AccountForm from '../components/AccountForm';
import { ErrorNotice, Skeletons } from '../components/Feedback';
export default function SuperAdmin() {
  const salitas = useFetch<(Salita & { administradores: number })[]>('/superadmin/salitas'); const users = useFetch<Administrador[]>('/superadmin/usuarios');
  async function save(path: string, data: Record<string, string>) { const response = await api.post<ApiResponse<unknown>>(path, data); if (!response.data.ok) throw new Error(response.data.mensaje); toast.success(response.data.mensaje); salitas.refetch(); users.refetch(); }
  return <><BackLink to="/"/><div className="page-heading"><div><span className="eyebrow">ADMINISTRACIÓN GLOBAL</span><h1>Portal superadministrador</h1><p>Organizá las salitas y asigná sus administradores.</p></div><span className="portal-badge"><ShieldCheck size={16}/> Superadmin</span></div><div className="portal-columns"><section className="form-card"><div className="form-card-heading"><Building2 size={22}/><h2>Nueva salita</h2></div><AccountForm mode="salita" submit={data => save('/superadmin/salitas', data)}/></section><section className="form-card"><div className="form-card-heading"><ShieldCheck size={22}/><h2>Nuevo administrador de salita</h2></div>{salitas.error ? <ErrorNotice message={salitas.error} retry={salitas.refetch}/> : <AccountForm mode="admin" salitas={salitas.data || []} submit={data => save('/superadmin/administradores', data)}/>}</section></div><section className="form-card mt-4"><h2>Salitas registradas</h2>{salitas.isLoading ? <Skeletons/> : salitas.error ? <ErrorNotice message={salitas.error} retry={salitas.refetch}/> : <div className="records-grid">{salitas.data?.map(s => <article className="tenant-card" key={s.id}><Building2 size={23}/><h3>{s.nombre}</h3><p>{s.direccion}</p><small>{s.administradores} administradores asignados</small></article>)}</div>}</section><section className="form-card mt-4"><h2>Administradores</h2>{users.isLoading ? <Skeletons/> : users.error ? <ErrorNotice message={users.error} retry={users.refetch}/> : <Administradores users={users.data || []} salitas={salitas.data || []} onChange={() => { salitas.refetch(); users.refetch(); }}/>}</section></>;
}
