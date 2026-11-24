import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Form } from 'react-bootstrap';
import { ArrowLeft, Check, Info } from 'lucide-react';
import { toast } from 'sonner';
import { schemas, obrasSociales, type Entity, type Paciente, type Medico, type Consultorio, type ApiResponse, type Salita } from '../../shared/schemas.ts';
import { appointmentDate, appointmentTimes, shifts } from '../../shared/agenda.ts';
import { entities } from '../lib/entities';
import { api, errorMessage, serverErrors } from '../lib/api';
import { useFetch } from '../hooks/useFetch';
import { useAuth } from '../auth/AuthContext';
import { ErrorNotice, Loading } from '../components/Feedback';
type Option = { value: string; label: string };
type Field = { key: string; label: string; type?: string; placeholder?: string; optional?: boolean; wide?: boolean; options?: Option[]; fixed?: Option; groups?: { label: string; options: Option[] }[] };
const personal: Field[] = [{ key: 'nombre', label: 'Nombre' }, { key: 'apellido', label: 'Apellido' }];
const phone: Field[] = [{ key: 'telefono.codigoArea', label: 'Código de área', placeholder: '3492' }, { key: 'telefono.numero', label: 'Teléfono', placeholder: '5550100' }];
const fields: Record<Exclude<Entity, 'turnos'>, Field[]> = {
  pacientes: [...personal, { key: 'dni', label: 'DNI', placeholder: 'Sin puntos ni espacios' }, { key: 'email', label: 'Email', type: 'email' }, ...phone, { key: 'direccion.calle', label: 'Calle' }, { key: 'direccion.numero', label: 'Altura' }, { key: 'direccion.barrio', label: 'Barrio' }, { key: 'obraSocial.nombre', label: 'Obra social', options: obrasSociales.map(nombre => ({ value: nombre, label: nombre })) }, { key: 'obraSocial.numeroAfiliado', label: 'Número de afiliado', optional: true }],
  medicos: [...personal, { key: 'matricula', label: 'Matrícula', placeholder: 'Ej.: MP-12345' }, { key: 'especialidad', label: 'Especialidad', placeholder: 'Ej.: Clínica médica' }, { key: 'email', label: 'Email', type: 'email' }, ...phone],
  consultorios: [{ key: 'nombre', label: 'Nombre', placeholder: 'Ej.: Consultorio general' }, { key: 'numero', label: 'Número', placeholder: 'Ej.: 1' }, { key: 'ubicacion', label: 'Ubicación', placeholder: 'Ej.: Planta baja, sector A', wide: true }, { key: 'descripcion', label: 'Descripción', type: 'textarea', optional: true, wide: true }],
};
function nest(values: Record<string, string>) {
  const result: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(values)) { const [parent, child] = path.split('.'); if (child) { const group = (result[parent] || {}) as Record<string, string>; group[child] = value; result[parent] = group; } else result[parent] = value; }
  return result;
}
export default function EntityForm({ entity }: { entity: Entity }) { return entity === 'turnos' ? <TurnoForm/> : <FormBody entity={entity} fields={fields[entity]}/>; }
function TurnoForm() {
  const { user } = useAuth();
  const [selectedSite, setSelectedSite] = useState('');
  const siteId = selectedSite || user?.salitaId || '';
  const query = user?.rol === 'cliente' ? '?salitaId=' + encodeURIComponent(siteId) : '';
  const sites = useFetch<Salita[]>('/salitas/publicas');
  const resource = useFetch<Paciente[]>('/pacientes');
  if (sites.isLoading || resource.isLoading) return <Loading label="Cargando salitas y pacientes…"/>;
  if (sites.error) return <ErrorNotice message={sites.error} retry={sites.refetch}/>;
  if (resource.error) return <ErrorNotice message={resource.error} retry={resource.refetch}/>;

  return <>
    <div className="form-card mb-3">
      <Form.Label htmlFor="turno-salita">¿En qué salita querés atenderte?</Form.Label>
      <Form.Select id="turno-salita" value={siteId} disabled={user?.rol !== 'cliente'} onChange={event => setSelectedSite(event.target.value)}>
        {sites.data?.map(site => <option key={site.id} value={site.id}>{site.nombre}</option>)}
      </Form.Select>
    </div>
    <TurnoSiteForm key={siteId} query={query} patients={resource.data || []}/>
  </>;
}
function TurnoSiteForm({ query, patients }: { query: string; patients: Paciente[] }) {
  const { user } = useAuth();
  const doctors = useFetch<Medico[]>('/medicos' + query);
  const rooms = useFetch<Consultorio[]>('/consultorios' + query);
  const resources = [doctors, rooms];
  if (resources.some(r => r.isLoading)) return <Loading label="Cargando pacientes, médicos y consultorios…"/>;
  if (resources.some(r => r.error)) return <><Link to="/turnos" className="back-link"><ArrowLeft size={16}/> Volver a turnos</Link>{resources.map((r, i) => r.error ? <ErrorNotice key={i} message={r.error} retry={r.refetch}/> : null)}</>;
  const missing = [!patients.length && 'pacientes', !doctors.data?.length && 'medicos', !rooms.data?.length && 'consultorios'].filter(Boolean) as Entity[];
  if (missing.length && user?.rol === 'cliente') return <div className="form-card"><h1>La agenda todavía no está disponible</h1><p>La sede seleccionada todavía debe registrar sus profesionales y consultorios para recibir turnos.</p><Link to="/mi-portal">Volver a mi portal</Link></div>;
  if (missing.length) return <div className="form-card"><h1>Prepará tu primer turno</h1><p>Antes de reservar, necesitás registros en estas secciones:</p>{missing.map(key => <Link className="btn btn-outline-primary me-2 mb-2" key={key} to={`/${key}/nuevo`}>Crear {entities[key].singular}</Link>)}<div><Link className="back-link mt-3" to="/turnos">Volver a turnos</Link></div></div>;
  const options = (list: (Paciente | Medico)[]) => list.map(x => ({ value: x.id, label: `${x.nombre} ${x.apellido}${'especialidad' in x ? ` · ${x.especialidad}` : ` · DNI ${x.dni}`}` }));
  const patientOptions = options(patients);
  const patient = patientOptions.find(option => option.value === user?.pacienteId);
  return <FormBody entity="turnos" query={query} fields={[
    { key: 'paciente', label: 'Paciente', options: patientOptions, fixed: user?.rol === 'cliente' ? patient : undefined, wide: true },
    { key: 'medico', label: 'Médico', groups: doctorGroups(doctors.data || [], options), wide: true },
    { key: 'consultorio', label: 'Consultorio', fixed: { value: '', label: 'Se asigna al confirmar según disponibilidad en la salita' }, wide: true },
    { key: 'dia', label: 'Fecha (lunes a viernes)', type: 'date' },
    { key: 'franja', label: 'Turno', options: shifts.map(shift => ({ value: shift.id, label: shift.label })) },
    { key: 'fechaTurno', label: 'Hora', options: [] },
    { key: 'observaciones', label: 'Observaciones', type: 'textarea', optional: true, wide: true },
  ]}/>;
}
const general = [
  ['Medicina general', /general|clinic[ao]/],
  ['Pediatría', /pediatr/],
  ['Ginecología', /ginecolog/],
  ['Odontología', /odontolog/],
] as const;
const specialists = [
  ['Cardiología', /cardiolog/],
  ['Gastroenterología', /gastroenterolog/],
  ['Neurología', /neurolog/],
] as const;

function doctorGroups(doctors: Medico[], toOptions: (doctors: Medico[]) => Option[]) {
  const categorized = new Map(doctors.map(doctor => {
    const specialty = doctor.especialidad.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    return [doctor, [...specialists, ...general].find(([, pattern]) => pattern.test(specialty))?.[0]];
  }));
  const groups = [
    { label: 'Médico general', specialties: general },
    { label: 'Especialidades', specialties: specialists },
  ].map(({ label, specialties }) => ({
    label,
    options: specialties.flatMap(([specialty]) => {
      const matches = doctors.filter(doctor => categorized.get(doctor) === specialty);
      return matches.length ? toOptions(matches) : [{ value: '', label: specialty + ' · Sin profesionales disponibles' }];
    }),
  }));
  const others = doctors.filter(doctor => !categorized.get(doctor));
  if (others.length) groups.push({ label: 'Otras especialidades', options: toOptions(others) });
  return groups;
}

function FormBody({ entity, fields: formFields, query = '' }: { entity: Entity; fields: Field[]; query?: string }) {
  const config = entities[entity]; const Icon = config.icon; const navigate = useNavigate(); const formRef = useRef<HTMLFormElement>(null); const submitting = useRef(false);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(formFields.map(f => [f.key, f.fixed?.value ?? '']))); const [errors, setErrors] = useState<Record<string, string>>({}); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  function focusError(next: Record<string, string>) { requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>(`[name="${Object.keys(next)[0]}"]`)?.focus()); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (submitting.current) return; setError('');
    const payload = nest(values);
    if (entity === 'pacientes' && values['obraSocial.nombre'] === 'Particular') {
      payload.obraSocial = { nombre: 'Particular', numeroAfiliado: '' };
    }
    if (entity === 'turnos') {
      delete payload.consultorio;
      payload.fechaTurno = appointmentDate(values.dia, values.fechaTurno);
    } const parsed = schemas[entity].safeParse(payload);
    if (!parsed.success) { const next: Record<string, string> = {}; for (const issue of parsed.error.issues) next[issue.path.join('.')] ??= issue.message; setErrors(next); focusError(next); return; }
    setErrors({}); submitting.current = true; setBusy(true);
    try { const response = await api.post<ApiResponse<unknown>>(`/${entity}${query}`, parsed.data); if (!response.data.ok) throw new Error(response.data.mensaje); toast.success(`${config.singular[0].toUpperCase() + config.singular.slice(1)} creado correctamente.`); navigate(`/${entity}`); }
    catch (error) { const next = serverErrors(error); setErrors(next); setError(errorMessage(error)); toast.error(errorMessage(error)); if (Object.keys(next).length) focusError(next); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <><Link to={`/${entity}`} className="back-link"><ArrowLeft size={16}/> Volver a {config.title.toLowerCase()}</Link><div className="page-heading"><div><span className="eyebrow">NUEVO REGISTRO</span><h1>Nuevo {config.singular}</h1><p>Completá los datos para incorporarlo al sistema.</p></div></div><div className="form-layout"><section className="form-card"><div className="form-card-heading"><span className={`record-icon ${config.color}`}><Icon size={21}/></span><h2>Datos del {config.singular}</h2></div>{error && <ErrorNotice message={error}/>}<Form noValidate ref={formRef} onSubmit={submit}><div className="form-fields">{formFields.filter(field => field.key !== 'obraSocial.numeroAfiliado' || values['obraSocial.nombre'] !== 'Particular').map(field => { const id = 'field-' + field.key.replaceAll('.', '-');
    const isTime = entity === 'turnos' && field.key === 'fechaTurno';
    const times = isTime ? appointmentTimes(values.dia, values.franja)
      .filter(time => Date.parse(appointmentDate(values.dia, time)) > Date.now()) : [];
    const options = isTime ? times.map(time => ({ value: time, label: time })) : field.options; const props = { id, name: field.key, value: values[field.key] || '', disabled: busy || (isTime && !times.length), required: !field.optional && !field.fixed, isInvalid: !!errors[field.key], 'aria-describedby': errors[field.key] ? `${id}-error` : undefined, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => { setValues(v => ({ ...v, [field.key]: event.target.value, ...(['dia', 'franja'].includes(field.key) ? { fechaTurno: '' } : {}) })); setErrors(old => { const next = { ...old }; delete next[field.key]; return next; }); } }; return <Form.Group key={field.key} className={field.wide ? 'field-wide' : ''}><Form.Label htmlFor={id}>{field.label}{field.fixed ? null : field.optional ? <span className="optional"> · opcional</span> : <span className="required-mark"> *</span>}</Form.Label>{field.fixed ? <Form.Control {...props} value={field.fixed.label} readOnly/> : options || field.groups ? <Form.Select {...props}><option value="">{isTime && !times.length ? (values.dia && values.franja ? "Sin horarios para esa fecha y turno" : "Elegí fecha y turno") : "Seleccioná una opción"}</option>{options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      {field.groups?.map(group => <optgroup key={group.label} label={group.label}>
        {group.options.map(option => <option key={option.value || option.label} value={option.value} disabled={!option.value}>{option.label}</option>)}
      </optgroup>)}</Form.Select> : field.type === 'textarea' ? <Form.Control {...props} as="textarea" rows={3} maxLength={entity === 'turnos' ? 500 : 300}/> : <Form.Control {...props} type={field.type || 'text'} placeholder={field.placeholder} inputMode={['dni', 'numero', 'direccion.numero', 'telefono.codigoArea', 'telefono.numero'].includes(field.key) ? 'numeric' : undefined}/>}<Form.Control.Feedback id={`${id}-error`} type="invalid">{errors[field.key]}</Form.Control.Feedback></Form.Group>; })}</div><div className="form-actions"><Link to={`/${entity}`} className={`btn btn-outline-secondary ${busy ? 'disabled' : ''}`} aria-disabled={busy}>Cancelar</Link><Button type="submit" disabled={busy}>{busy ? 'Guardando…' : <><Check size={17}/> Guardar {config.singular}</>}</Button></div></Form></section><aside className="form-help"><span className="record-icon teal"><Info size={21}/></span><h2>Los detalles hacen la diferencia.</h2><p>Los campos con asterisco son obligatorios. Revisá la información antes de guardar.</p>{entity === 'turnos' ? <p>Los turnos duran 30 minutos. El paciente, profesional y consultorio deben estar disponibles durante ese intervalo.</p> : <p>Los datos estarán disponibles en el listado apenas se confirme el guardado.</p>}<div className="help-divider"/><small>Este entorno educativo comienza con datos ficticios para practicar.</small></aside></div></>;
}
