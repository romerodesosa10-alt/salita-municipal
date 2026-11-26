import BackLink from '../components/BackLink';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Form, InputGroup, Modal } from 'react-bootstrap';
import { Mail, MapPin, Phone, Plus, Search, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import { estadosPaciente, mostrarCobertura, type Consultorio, type Entity, type EntityMap, type EstadoPaciente, type ITurno, type Medico, type Paciente } from '../../shared/schemas.ts';
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
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [toRemove, setToRemove] = useState<string[]>([]);
  const [removeError, setRemoveError] = useState('');
  const [removing, setRemoving] = useState(false);
  const managesPatients = entity === 'pacientes' && user?.rol === 'admin';
  const filtered = (data || []).filter(row => {
    if (entity === 'turnos') { const t = row as ITurno; return (!status || t.estado === status) && includes(`${t.paciente?.nombre || ''} ${t.paciente?.apellido || ''} ${t.paciente?.dni || ''} ${t.medico?.nombre || ''} ${t.medico?.apellido || ''} ${t.especialidad}`, search.trim()); }
    if (entity === 'consultorios') { const c = row as Consultorio; return includes(`${c.nombre} ${c.numero} ${c.ubicacion}`, search.trim()); }
    if (managesPatients && status && ((row as Paciente).estado ?? 'en-espera') !== status) return false;
    const person = row as Paciente | Medico; return includes(`${person.nombre} ${person.apellido} ${'dni' in person ? person.dni : person.matricula + ' ' + person.especialidad}`, search.trim());
  });
  const marked = filtered.filter(row => checked.has(row.id)).map(row => row.id);
  const allMarked = filtered.length > 0 && marked.length === filtered.length;

  function selectPatient(id: string, selected: boolean) {
    setChecked(previous => {
      const next = new Set(previous);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  }

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

  async function removePatients() {
    if (removing || !toRemove.length) return;
    setRemoving(true);
    setRemoveError('');
    try {
      await api.delete('/pacientes', { data: { ids: toRemove } });
      setChecked(new Set());
      setToRemove([]);
      toast.success('Pacientes quitados del listado.');
      refetch();
    } catch (cause) {
      setRemoveError(errorMessage(cause));
    } finally {
      setRemoving(false);
    }
  }

  async function atender(id: string) { if (busyId) return; setBusyId(id); try { await api.patch(`/turnos/${id}/atender`); toast.success('Turno marcado como atendido.'); refetch(); } catch (error) { toast.error(errorMessage(error)); } finally { setBusyId(''); } }
  return <><BackLink to="/portal"/><div className="page-heading"><div><span className="eyebrow">GESTIÓN DE ATENCIÓN</span><h1>{config.title}</h1><p>{config.description}</p></div><Link className="btn btn-primary" to={`/${entity}/nuevo`}><Plus size={18}/> Nuevo {config.singular}</Link></div>
    <section className="list-panel"><div className="list-toolbar"><div className="section-title"><span className={`record-icon ${config.color}`}><Icon size={19}/></span><h2>Todos los {config.title.toLowerCase()}</h2>{data && <span className="count-pill">{data.length}</span>}</div><div className="toolbar-controls"><InputGroup className="search-input"><InputGroup.Text><Search size={16}/></InputGroup.Text><Form.Control aria-label={`Buscar ${config.title.toLowerCase()}`} placeholder={entity === 'turnos' ? 'Buscar paciente o médico…' : 'Buscar por nombre o identificación…'} value={search} onChange={e => { setSearch(e.target.value); setChecked(new Set()); }}/></InputGroup>{managesPatients && <Form.Select aria-label="Filtrar por estado" value={status} onChange={e => { setStatus(e.target.value); setChecked(new Set()); }}><option value="">Todos los estados</option>{estadosPaciente.map(value => <option key={value} value={value}>{patientStatusLabels[value]}</option>)}</Form.Select>}{entity === 'turnos' && <Form.Select aria-label="Filtrar por estado" value={status} onChange={e => setStatus(e.target.value)}><option value="">Todos los estados</option><option value="pendiente">Pendientes</option><option value="atendido">Atendidos</option></Form.Select>}<Button variant="outline-secondary" aria-label="Actualizar registros" onClick={refetch} disabled={isLoading}><RotateCw size={16}/></Button></div></div>
    {managesPatients && !isLoading && !error && filtered.length > 0 && <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 px-4 py-3 border-bottom">
      <Form.Check id="seleccionar-pacientes" label="Seleccionar todos los visibles" checked={allMarked}
        ref={input => { if (input) input.indeterminate = marked.length > 0 && !allMarked; }}
        onChange={event => setChecked(event.target.checked ? new Set(filtered.map(row => row.id)) : new Set())}/>
      <Button variant="outline-danger" size="sm" disabled={!marked.length || Boolean(busyId)} onClick={() => { setRemoveError(''); setToRemove(marked); }}>
        Eliminar seleccionados{marked.length > 0 && ' (' + marked.length + ')'}
      </Button>
    </div>}
    {isLoading ? <Skeletons/> : error ? <ErrorNotice message={error} retry={refetch}/> : filtered.length === 0 ? <Empty title={data?.length ? 'No encontramos coincidencias.' : `Todavía no hay ${config.title.toLowerCase()}.`} text={data?.length ? 'Probá con otra búsqueda o cambiá el filtro.' : `Usá “Nuevo ${config.singular}” para agregar el primer registro.`}/> : <div className="records-grid">{filtered.map(row => entity === 'turnos' ? <TurnoCard key={row.id} turno={row as ITurno} onAtender={user?.rol === 'admin' ? atender : undefined} busy={busyId === row.id}/> : <RecordCard key={row.id} entity={entity} record={row} controls={managesPatients && <div className="mt-3">
      <Form.Check id={'seleccionar-' + row.id} label="Seleccionar" aria-label={'Seleccionar ' + (row as Paciente).nombre + ' ' + (row as Paciente).apellido}
        checked={checked.has(row.id)} onChange={event => selectPatient(row.id, event.target.checked)}/>
      <Form.Group className="mt-2" controlId={'estado-' + row.id}>
        <Form.Label className="mb-1">Estado</Form.Label>
        <Form.Select size="sm" className="patient-status" data-status={(row as Paciente).estado ?? 'en-espera'} value={(row as Paciente).estado ?? 'en-espera'} disabled={Boolean(busyId) || removing}
          onChange={event => void changePatientStatus(row.id, event.target.value as EstadoPaciente)}>
          {estadosPaciente.map(value => <option key={value} value={value}>{patientStatusLabels[value]}</option>)}
        </Form.Select>
      </Form.Group>
    </div>}/>)}</div>}
    {!isLoading && !error && <div className="list-footer">{filtered.length} {filtered.length === 1 ? 'registro' : 'registros'}{data && filtered.length !== data.length ? ` de ${data.length}` : ''}<span>Información actualizada desde el servidor</span></div>}</section>
    {toRemove.length > 0 && <Modal show onHide={() => { if (!removing) setToRemove([]); }} aria-labelledby="quitar-pacientes-title">
      <Modal.Header closeButton={!removing}><Modal.Title id="quitar-pacientes-title">Eliminar pacientes del listado</Modal.Title></Modal.Header>
      <Modal.Body>
        {removeError && <ErrorNotice message={removeError}/>}
        <p className="mb-0">Vas a quitar {toRemove.length} {toRemove.length === 1 ? 'paciente' : 'pacientes'} del listado de esta salita. Sus turnos previos se conservan.</p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" disabled={removing} onClick={() => setToRemove([])}>Cancelar</Button>
        <Button variant="danger" disabled={removing} onClick={() => void removePatients()}>{removing ? 'Eliminando…' : 'Confirmar eliminación'}</Button>
      </Modal.Footer>
    </Modal>}
  </>;
}
function RecordCard({ entity, record, controls }: { entity: Entity; record: EntityMap[Entity]; controls?: ReactNode }) {
  const config = entities[entity]; const Icon = config.icon;
  if (entity === 'consultorios') { const room = record as Consultorio; return <Card className="record-card"><Card.Body><div className="record-top"><span className={`record-icon ${config.color}`}><Icon size={20}/></span><span className="subtle-badge">N.º {room.numero}</span></div><h2>{room.nombre}</h2><p className="record-subtitle">Consultorio {room.numero}</p><div className="record-line"><MapPin size={16}/>{room.ubicacion}</div><p className="room-description">{room.descripcion || 'Sin descripción adicional.'}</p></Card.Body></Card>; }
  const person = record as Paciente | Medico;
  return <Card className="record-card"><Card.Body><div className="record-top"><span className={`person-initials ${config.color}`}>{person.nombre.slice(0, 1)}{person.apellido.slice(0, 1)}</span><span className="subtle-badge">{'dni' in person ? `DNI ${person.dni}` : `Mat. ${person.matricula}`}</span></div><h2>{person.nombre} {person.apellido}</h2><p className="record-subtitle">{'dni' in person ? 'Obra social · ' + mostrarCobertura(person.obraSocial.nombre) : person.especialidad}</p><div className="record-line"><Mail size={16}/><a href={`mailto:${person.email}`}>{person.email}</a></div><div className="record-line"><Phone size={16}/><span>({person.telefono.codigoArea}) {person.telefono.numero}</span></div>{controls}</Card.Body></Card>;
}
