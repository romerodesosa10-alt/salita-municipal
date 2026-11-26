import useRecordRemoval from '../components/useRecordRemoval';
import BackLink from '../components/BackLink';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Form, InputGroup } from 'react-bootstrap';
import { Mail, MapPin, Phone, Plus, Search, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import { estadosPaciente, estadosTurno, estadoTurnoLabels, type EstadoTurno, mostrarCobertura, type Consultorio, type Entity, type EntityMap, type EstadoPaciente, type ITurno, type Medico, type Paciente } from '../../shared/schemas.ts';
import { useFetch } from '../hooks/useFetch';
import { entities } from '../lib/entities';
import { api, errorMessage } from '../lib/api';
import { Empty, ErrorNotice, Skeletons } from '../components/Feedback';
import TurnoCard from '../components/TurnoCard';
import { useAuth } from '../auth/AuthContext';
function includes(value: string, query: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()); }
const patientStatusLabels: Record<EstadoPaciente, string> = {
  'en-espera': 'En espera',
  atendido: 'Atendido',
  cancelado: 'Cancelado',
};

export default function EntityList({ entity }: { entity: Entity }) {
  const { user } = useAuth();
  const config = entities[entity]; const Icon = config.icon;
  const { data, isLoading, error, refetch } = useFetch<EntityMap[Entity][]>(`/${entity}`);
  const [search, setSearch] = useState(''); const [status, setStatus] = useState(''); const [busyId, setBusyId] = useState('');
  const canRemove = user?.rol === 'admin';
  const managesPatients = entity === 'pacientes' && user?.rol === 'admin';
  const filtered = (data || []).filter(row => {
    if (entity === 'turnos') { const t = row as ITurno; return (!status || t.estado === status) && includes(`${t.paciente?.nombre || ''} ${t.paciente?.apellido || ''} ${t.paciente?.dni || ''} ${t.medico?.nombre || ''} ${t.medico?.apellido || ''} ${t.especialidad}`, search.trim()); }
    if (entity === 'consultorios') { const c = row as Consultorio; return includes(`${c.nombre} ${c.numero} ${c.ubicacion}`, search.trim()); }
    if (managesPatients && status && ((row as Paciente).estado ?? 'en-espera') !== status) return false;
    const person = row as Paciente | Medico; return includes(`${person.nombre} ${person.apellido} ${'dni' in person ? person.dni : person.matricula + ' ' + person.especialidad}`, search.trim());
  });
  const removal = useRecordRemoval({
    rows: filtered,
    path: '/' + entity,
    onChange: refetch,
    disabled: Boolean(busyId),
    note: entity === 'turnos'
      ? 'Los turnos se quitarán de la agenda y del portal del paciente.'
      : 'Los registros se quitarán del listado. Sus turnos anteriores se conservan.',
  });

  async function changePatientStatus(id: string, estado: EstadoPaciente) {
    if (busyId) return;
    setBusyId(id);
    try {
      await api.patch('/pacientes/' + encodeURIComponent(id), { estado });
      toast.success('Estado actualizado.');
      refetch();
    } catch (cause) {
      toast.error(errorMessage(cause));
    } finally {
      setBusyId('');
    }
  }

  async function cambiarEstadoTurno(id: string, estado: EstadoTurno) { if (busyId) return; setBusyId(id); try { await api.patch(`/turnos/${id}/estado`, { estado }); toast.success('Estado del turno actualizado.'); refetch(); } catch (error) { toast.error(errorMessage(error)); } finally { setBusyId(''); } }
  return <><BackLink to="/portal"/><div className="page-heading"><div><span className="eyebrow">GESTIÓN DE ATENCIÓN</span><h1>{config.title}</h1><p>{config.description}</p></div><Link className="btn btn-primary" to={`/${entity}/nuevo`}><Plus size={18}/> Nuevo {config.singular}</Link></div>
    <section className="list-panel"><div className="list-toolbar"><div className="section-title"><span className={`record-icon ${config.color}`}><Icon size={19}/></span><h2>Todos los {config.title.toLowerCase()}</h2>{data && <span className="count-pill">{data.length}</span>}</div><div className="toolbar-controls"><InputGroup className="search-input"><InputGroup.Text><Search size={16}/></InputGroup.Text><Form.Control aria-label={`Buscar ${config.title.toLowerCase()}`} placeholder={entity === 'turnos' ? 'Buscar paciente o médico…' : 'Buscar por nombre o identificación…'} value={search} onChange={e => { setSearch(e.target.value); removal.clear(); }}/></InputGroup>{managesPatients && <Form.Select aria-label="Filtrar por estado" value={status} onChange={e => { setStatus(e.target.value); removal.clear(); }}><option value="">Todos los estados</option>{estadosPaciente.map(value => <option key={value} value={value}>{patientStatusLabels[value]}</option>)}</Form.Select>}{entity === 'turnos' && <Form.Select aria-label="Filtrar por estado" value={status} onChange={e => { setStatus(e.target.value); removal.clear(); }}><option value="">Todos los estados</option>{estadosTurno.map(estado => <option key={estado} value={estado}>{estadoTurnoLabels[estado]}</option>)}</Form.Select>}<Button variant="outline-secondary" aria-label="Actualizar registros" onClick={refetch} disabled={isLoading}><RotateCw size={16}/></Button></div></div>
    {canRemove && !isLoading && !error && removal.toolbar}
    {isLoading ? <Skeletons/> : error ? <ErrorNotice message={error} retry={refetch}/> : filtered.length === 0 ? <Empty title={data?.length ? 'No encontramos coincidencias.' : `Todavía no hay ${config.title.toLowerCase()}.`} text={data?.length ? 'Probá con otra búsqueda o cambiá el filtro.' : `Usá “Nuevo ${config.singular}” para agregar el primer registro.`}/> : <div className="records-grid">{filtered.map(row => entity === 'turnos' ? <TurnoCard key={row.id} turno={row as ITurno} onStatusChange={user?.rol === 'admin' ? cambiarEstadoTurno : undefined} busy={busyId === row.id} removalControls={canRemove && <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3">{removal.checkbox(row.id, 'Seleccionar turno', true)}{removal.button(row.id)}</div>}/> : <RecordCard key={row.id} entity={entity} record={row} controls={canRemove && <div className="mt-3">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">{removal.checkbox(row.id, 'Seleccionar ' + (row as Paciente | Medico | Consultorio).nombre, true)}{removal.button(row.id)}</div>
      {managesPatients && <Form.Group className="mt-2" controlId={'estado-' + row.id}>
        <Form.Label className="mb-1">Estado</Form.Label>
        <Form.Select size="sm" className="patient-status" data-status={(row as Paciente).estado ?? 'en-espera'} value={(row as Paciente).estado ?? 'en-espera'} disabled={Boolean(busyId)}
          onChange={event => void changePatientStatus(row.id, event.target.value as EstadoPaciente)}>
          {estadosPaciente.map(value => <option key={value} value={value}>{patientStatusLabels[value]}</option>)}
        </Form.Select>
      </Form.Group>}
    </div>}/>)}</div>}
    {!isLoading && !error && <div className="list-footer">{filtered.length} {filtered.length === 1 ? 'registro' : 'registros'}{data && filtered.length !== data.length ? ` de ${data.length}` : ''}<span>Información actualizada desde el servidor</span></div>}</section>
    {canRemove && removal.dialog}
  </>;
}
function RecordCard({ entity, record, controls }: { entity: Entity; record: EntityMap[Entity]; controls?: ReactNode }) {
  const config = entities[entity]; const Icon = config.icon;
  if (entity === 'consultorios') { const room = record as Consultorio; return <Card className="record-card"><Card.Body><div className="record-top"><span className={`record-icon ${config.color}`}><Icon size={20}/></span><span className="subtle-badge">N.º {room.numero}</span></div><h2>{room.nombre}</h2><p className="record-subtitle">Consultorio {room.numero}</p><div className="record-line"><MapPin size={16}/>{room.ubicacion}</div><p className="room-description">{room.descripcion || 'Sin descripción adicional.'}</p>{controls}</Card.Body></Card>; }
  const person = record as Paciente | Medico;
  return <Card className="record-card"><Card.Body><div className="record-top"><span className={`person-initials ${config.color}`}>{person.nombre.slice(0, 1)}{person.apellido.slice(0, 1)}</span><span className="subtle-badge">{'dni' in person ? `DNI ${person.dni}` : `Mat. ${person.matricula}`}</span></div><h2>{person.nombre} {person.apellido}</h2><p className="record-subtitle">{'dni' in person ? 'Obra social · ' + mostrarCobertura(person.obraSocial.nombre) : person.especialidad}</p><div className="record-line"><Mail size={16}/><a href={`mailto:${person.email}`}>{person.email}</a></div><div className="record-line"><Phone size={16}/><span>({person.telefono.codigoArea}) {person.telefono.numero}</span></div>{controls}</Card.Body></Card>;
}
