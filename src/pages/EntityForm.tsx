import DoctorStatus from '../components/DoctorStatus';
import { isAxiosError } from 'axios';
import { BookingCountdown, useBookingCountdown } from '../components/BookingCountdown';
import BackLink from '../components/BackLink';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, Form } from 'react-bootstrap';
import { ArrowLeft, Check, Info } from 'lucide-react';
import { toast } from 'sonner';
import { derivacionTurnoSchema, schemas, opcionesCobertura, type Entity, type Paciente, type Medico, type Consultorio, type ApiResponse, type AppointmentSmsStatus, type ITurno, type Salita } from '../../shared/schemas.ts';
import { appointmentDate, appointmentWeekStart, localAppointmentDay, shifts, weekdays, type AppointmentAvailability, type HorarioMedico } from '../../shared/agenda.ts';
import { entities } from '../lib/entities';
import { api, errorMessage, serverErrors } from '../lib/api';
import { useFetch } from '../hooks/useFetch';
import { useAuth } from '../auth/AuthContext';
import AvailabilityCalendar from '../components/AvailabilityCalendar';
import AgendaMedica from '../components/AgendaMedica';
import { ErrorNotice, Loading } from '../components/Feedback';
type Option = { value: string; label: string; disabled?: boolean };
type Field = { key: string; label: string; type?: string; placeholder?: string; optional?: boolean; wide?: boolean; options?: Option[]; fixed?: Option; groups?: { label: string; options: Option[] }[] };
const personal: Field[] = [{ key: 'nombre', label: 'Nombre' }, { key: 'apellido', label: 'Apellido' }];
const phone: Field[] = [{ key: 'telefono.codigoArea', label: 'Código de área', placeholder: '3492' }, { key: 'telefono.numero', label: 'Teléfono', placeholder: '5550100' }];
const fields: Record<Exclude<Entity, 'turnos'>, Field[]> = {
  pacientes: [...personal, { key: 'dni', label: 'DNI', placeholder: 'Sin puntos ni espacios' }, { key: 'email', label: 'Email', type: 'email' }, ...phone, { key: 'direccion.calle', label: 'Calle' }, { key: 'direccion.numero', label: 'Altura' }, { key: 'direccion.barrio', label: 'Barrio' }, { key: 'obraSocial.nombre', label: '¿Tiene obra social?', options: opcionesCobertura.map(nombre => ({ value: nombre, label: nombre })) }],
  medicos: [...personal, { key: 'matricula', label: 'Matrícula', placeholder: 'Ej.: MP-12345' }, { key: 'especialidad', label: 'Especialidad', placeholder: 'Ej.: Clínica médica' }, { key: 'email', label: 'Email', type: 'email' }, ...phone],
  consultorios: [{ key: 'numero', label: 'Número', placeholder: 'Ej.: 1' }, { key: 'ubicacion', label: 'Ubicación', placeholder: 'Ej.: Planta baja, sector A', wide: true }, { key: 'descripcion', label: 'Descripción', type: 'textarea', optional: true, wide: true }],
};
function nest(values: Record<string, string>) {
  const result: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(values)) { const [parent, child] = path.split('.'); if (child) { const group = (result[parent] || {}) as Record<string, string>; group[child] = value; result[parent] = group; } else result[parent] = value; }
  return result;
}
export default function EntityForm({ entity }: { entity: Entity }) { return entity === 'turnos' ? <TurnoBooking/> : <FormBody entity={entity} fields={fields[entity]}/>; }
type Referral = { patientId: string; original?: ITurno };

function TurnoBooking() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const originalId = user?.rol === 'admin' ? params.get('derivar') : null;
  const patientId = user?.rol === 'admin' ? params.get('pacienteUrgente') : null;
  const seconds = useBookingCountdown();
  return seconds > 0 ? <><BackLink to="/mi-portal"/><BookingCountdown seconds={seconds}/></> : originalId ? <ReferralForm id={originalId}/> : <TurnoForm referral={patientId ? { patientId } : undefined}/>;
}
function ReferralForm({ id }: { id: string }) {
  const { data, isLoading, error, refetch } = useFetch<ITurno>('/turnos/' + encodeURIComponent(id));
  if (isLoading) return <Loading label="Cargando turno…"/>;
  if (error) return <><BackLink to="/turnos"/><ErrorNotice message={error} retry={refetch}/></>;
  if (!data?.paciente || data.estado !== 'pendiente') {
    return <><BackLink to="/turnos"/><ErrorNotice message="Solo se pueden derivar turnos en espera con paciente asignado."/></>;
  }
  return <TurnoForm key={id} referral={{ patientId: data.paciente.id, original: data }}/>;
}

function TurnoForm({ referral }: { referral?: Referral }) {
  const { user } = useAuth();
  const [selectedSite, setSelectedSite] = useState('');
  const siteId = selectedSite || user?.salitaId || '';
  const query = user?.rol === 'cliente' ? '?salitaId=' + encodeURIComponent(siteId) : '';
  const sites = useFetch<Salita[]>('/salitas/publicas');
  const resource = useFetch<Paciente[]>('/pacientes');
  const back = <BackLink to={user?.rol === 'cliente' ? '/mi-portal' : referral && !referral.original ? '/pacientes' : '/turnos'}/>;
  if (sites.isLoading || resource.isLoading) return <>{back}<Loading label="Cargando salitas y pacientes…"/></>;
  if (sites.error) return <>{back}<ErrorNotice message={sites.error} retry={sites.refetch}/></>;
  if (resource.error) return <>{back}<ErrorNotice message={resource.error} retry={resource.refetch}/></>;

  return <>
    {back}
    <div className="form-card mb-3">
      <Form.Label htmlFor="turno-salita">¿En qué salita querés atenderte?</Form.Label>
      <Form.Select id="turno-salita" value={siteId} disabled={user?.rol !== 'cliente'} onChange={event => setSelectedSite(event.target.value)}>
        {sites.data?.map(site => <option key={site.id} value={site.id}>{site.nombre}</option>)}
      </Form.Select>
    </div>
    <TurnoSiteForm key={siteId} query={query} patients={resource.data || []} referral={referral}/>
  </>;
}
function TurnoSiteForm({ query, patients, referral }: { query: string; patients: Paciente[]; referral?: Referral }) {
  const { user } = useAuth();
  const doctors = useFetch<Medico[]>('/medicos' + query);
  const rooms = useFetch<Consultorio[]>('/consultorios' + query);
  const resources = [doctors, rooms];
  if (resources.some(r => r.isLoading)) return <Loading label="Cargando pacientes, médicos y consultorios…"/>;
  if (resources.some(r => r.error)) return <>{resources.map((r, i) => r.error ? <ErrorNotice key={i} message={r.error} retry={r.refetch}/> : null)}</>;
  const referredPatient = referral?.original?.paciente ?? patients.find(item => item.id === referral?.patientId);
  if (referral && !referredPatient) return <ErrorNotice message="No se encontró el paciente para derivar."/>;
  const missing = [!referredPatient && !patients.length && 'pacientes', !doctors.data?.length && 'medicos', !rooms.data?.length && 'consultorios'].filter(Boolean) as Entity[];
  if (missing.length && user?.rol === 'cliente') return <div className="form-card"><h1>La agenda todavía no está disponible</h1><p>La sede seleccionada todavía debe registrar sus profesionales y consultorios para recibir turnos.</p></div>;
  if (missing.length) return <div className="form-card"><h1>Prepará tu primer turno</h1><p>Antes de reservar, necesitás registros en estas secciones:</p>{missing.filter(key => key !== 'consultorios').map(key => <Link className="btn btn-outline-primary me-2 mb-2" key={key} to={`/${key}/nuevo`}>Crear {entities[key].singular}</Link>)}{missing.includes('consultorios') && <p>Cargá el consultorio desde <Link to="/medicos">Médicos</Link>, al registrar o editar un profesional.</p>}</div>;
  const options = (list: (Paciente | Medico)[]): Option[] => list.map(person => {
    const onLeave = 'especialidad' in person && person.estado === 'de-licencia';
    const withoutRoom = 'especialidad' in person && !person.consultorioAsignado;
    const detail = 'especialidad' in person ? person.especialidad : 'DNI ' + person.dni;
    return { value: person.id, label: [person.nombre + ' ' + person.apellido, detail, ...(onLeave ? ['De licencia'] : withoutRoom ? ['Sin consultorio asignado'] : [])].join(' · '), disabled: onLeave || withoutRoom };
  });
  const patientOptions = options(patients);
  const patient = referredPatient ? options([referredPatient])[0] : patientOptions.find(option => option.value === user?.pacienteId);
  return <FormBody entity="turnos" referral={referral} query={query} doctors={doctors.data || []} fields={[
    { key: 'paciente', label: 'Paciente', options: patientOptions, fixed: user?.rol === 'cliente' || referral ? patient : undefined, wide: true },
    { key: 'medico', label: 'Médico', groups: doctorGroups(doctors.data || [], options), wide: true },
    { key: 'consultorio', label: 'Consultorio', fixed: { value: '', label: 'Elegí un profesional para ver su consultorio' }, wide: true },
    { key: 'franja', label: 'Turno', options: shifts.map(shift => ({ value: shift.id, label: shift.label })) },
    { key: 'fechaTurno', label: 'Fecha y horario', wide: true },
    ...(referral ? [{ key: 'motivoDerivacion', label: 'Motivo de la derivación', type: 'textarea', wide: true }] : []),
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

export function EditEntityForm({ entity }: { entity: 'medicos' | 'consultorios' }) {
  const { id = '' } = useParams();
  const { data, isLoading, error, refetch } = useFetch<Medico | Consultorio>(`/${entity}/${encodeURIComponent(id)}`);
  if (isLoading || error || !data) return <>
    <Link to={`/${entity}`} className="back-link"><ArrowLeft size={16}/> Volver al listado</Link>
    {isLoading ? <Loading label="Cargando registro…"/> : <ErrorNotice message={error || 'No se encontró el registro.'} retry={refetch}/>}
  </>;
  return <FormBody key={data.id} entity={entity} fields={fields[entity]} record={data}/>;
}

function FormBody({ entity, fields: formFields, record, referral, query = '', doctors = [] }: { entity: Entity; fields: Field[]; record?: Medico | Consultorio; referral?: Referral; query?: string; doctors?: Medico[] }) {
  const { updateBookingBlock } = useAuth();
  const config = entities[entity]; const Icon = config.icon; const navigate = useNavigate(); const formRef = useRef<HTMLFormElement>(null); const submitting = useRef(false);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(formFields.map(field => {
    const [key, child] = field.key.split('.');
    const value = field.key === 'observaciones' && referral?.original ? referral.original.observaciones : child ? (record as Medico | undefined)?.telefono?.[child as keyof Medico['telefono']] :
      record?.[key as keyof (Medico | Consultorio)];
    return [field.key, typeof value === 'string' ? value : field.fixed?.value ?? ''];
  }))); const [errors, setErrors] = useState<Record<string, string>>({}); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [roomChoice, setRoomChoice] = useState(record && 'matricula' in record ? record.consultorioId ?? '' : '');
  const [newRoom, setNewRoom] = useState({ numero: '', ubicacion: '', descripcion: '' });
  const rooms = useFetch<Consultorio[]>(entity === 'medicos' ? '/consultorios' : '');
  const [agenda, setAgenda] = useState<HorarioMedico[]>(() => record && 'agenda' in record ? record.agenda ?? [] : []);
  const doctor = doctors.find(item => item.id === values.medico);
  const [week, setWeek] = useState(() => appointmentWeekStart(localAppointmentDay()));
  const availabilityParams = new URLSearchParams(query);
  availabilityParams.set('desde', week);
  availabilityParams.set('medico', values.medico || '');
  availabilityParams.set('franja', values.franja || '');
  availabilityParams.set('paciente', values.paciente || '');
  if (referral?.original) availabilityParams.set('derivar', referral.original.id);
  const availabilityPath = doctor && values.franja ? '/turnos/disponibilidad?' + availabilityParams : '';
  const { data: days, error: availabilityError, isLoading: checkingSlots, refetch: refreshSlots } =
    useFetch<AppointmentAvailability[]>(availabilityPath, true);
  useEffect(() => {
    if (!availabilityPath) return;
    const timer = window.setInterval(refreshSlots, 15000);
    window.addEventListener('focus', refreshSlots);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refreshSlots); };
  }, [availabilityPath, refreshSlots]);
  const selectedSlot = days?.find(day => day.day === values.dia)?.slots.find(slot => slot.time === values.fechaTurno);
  function chooseDay(day: string) {
    setValues(prev => ({ ...prev, dia: day, fechaTurno: '' }));
    setErrors(prev => ({ ...prev, fechaTurno: '' }));
  }
  function focusError(next: Record<string, string>) { requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>(`[name="${Object.keys(next)[0]}"]`)?.focus()); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (submitting.current) return; setError('');
    const payload = nest(values);
    if (entity === 'consultorios') payload.nombre = 'Consultorio ' + values.numero.trim();
    if (entity === 'pacientes') {
      payload.obraSocial = { nombre: values['obraSocial.nombre'], numeroAfiliado: '' };
    }
    if (entity === 'medicos') {
      if (roomChoice === 'nuevo') {
        payload.consultorioNuevo = { ...newRoom, nombre: newRoom.numero.trim() ? 'Consultorio ' + newRoom.numero.trim() : '' };
      } else {
        payload.consultorioId = roomChoice || null;
      }
    }
    if (entity === 'medicos' && (!record || agenda.length > 0 || ('agenda' in record && record.agenda))) payload.agenda = agenda;
    if (entity === 'turnos') {
      if (!selectedSlot?.available) {
        setErrors({ fechaTurno: 'Elegí un horario disponible.' });
        return;
      }
      delete payload.dia;
      delete payload.consultorio;
      payload.fechaTurno = appointmentDate(values.dia, values.fechaTurno);
    } const parsed = (referral ? derivacionTurnoSchema : schemas[entity]).safeParse(payload);
    if (!parsed.success) { const next: Record<string, string> = {}; for (const issue of parsed.error.issues) next[issue.path.join('.')] ??= issue.message; setErrors(next); focusError(next); return; }
    setErrors({}); submitting.current = true; setBusy(true);
    try {
      const response = referral?.original
        ? await api.patch<ApiResponse<unknown>>('/turnos/' + encodeURIComponent(referral.original.id) + '/derivar', parsed.data)
        : record
        ? await api.patch<ApiResponse<unknown>>(`/${entity}/${encodeURIComponent(record.id)}`, parsed.data)
        : await api.post<ApiResponse<{ sms?: AppointmentSmsStatus }>>(`/${entity}${query}`, parsed.data);
      if (!response.data.ok) throw new Error(response.data.mensaje);
      toast.success(referral ? 'Turno derivado con urgencia.' : record ? 'Cambios guardados.' : `${config.singular[0].toUpperCase() + config.singular.slice(1)} creado correctamente.`);
      if (entity === 'turnos' && response.data.data && typeof response.data.data === 'object' && 'sms' in response.data.data) {
        const sms = response.data.data.sms;
        if (sms === 'en-cola') toast.info('Aviso por SMS aceptado para envío.');
        if (sms === 'sin-telefono') toast.warning('Turno guardado. El paciente no tiene un celular válido para avisos.');
        if (sms === 'sin-configurar') toast.warning('Turno guardado. El envío de SMS todavía no está configurado.');
        if (sms === 'fallido') toast.warning('Turno guardado. No se pudo enviar el SMS.');
      }
      navigate(`/${entity}`);
    }
    catch (error) {
      if (isAxiosError<ApiResponse<{ bloqueadoHasta?: string }>>(error)) {
        const until = error.response?.data?.data?.bloqueadoHasta;
        if (until) updateBookingBlock(until);
        if (entity === 'turnos' && error.response?.status === 409) refreshSlots();
      }
      const next = serverErrors(error); setErrors(next); setError(errorMessage(error)); toast.error(errorMessage(error)); if (Object.keys(next).length) focusError(next); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <>{entity !== 'turnos' && <Link to={`/${entity}`} className="back-link"><ArrowLeft size={16}/> Volver a {config.title.toLowerCase()}</Link>}<div className="page-heading"><div><span className="eyebrow">{referral ? 'PRIORIDAD URGENTE' : record ? 'EDITAR REGISTRO' : 'NUEVO REGISTRO'}</span><h1>{referral ? 'Derivar con urgencia' : (record ? 'Editar ' : 'Nuevo ') + config.singular}</h1><p>{referral ? 'Elegí un profesional, un horario y registrá el motivo.' : record ? 'Actualizá los datos y guardá los cambios.' : 'Completá los datos para incorporarlo al sistema.'}</p></div></div><div className="form-layout"><section className="form-card"><div className="form-card-heading"><span className={`record-icon ${config.color}`}><Icon size={21}/></span><h2>Datos del {config.singular}</h2></div>{record && 'matricula' in record && <DoctorStatus doctor={record}/>} {error && <ErrorNotice message={error}/>}<Form noValidate ref={formRef} onSubmit={submit}><div className="form-fields">{formFields.map(field => { const id = 'field-' + field.key.replaceAll('.', '-');
    if (entity === 'turnos' && field.key === 'fechaTurno') return <fieldset key={field.key} className="field-wide">
      <legend className="form-label">Fecha y horario</legend>
      {!availabilityPath ? <p className="muted mb-0">Elegí un médico y un turno para ver los cupos.</p> :
        <AvailabilityCalendar week={week} setWeek={next => { setWeek(next); chooseDay(''); }}
          days={days ?? []} day={values.dia || ''} pickDay={chooseDay}
          time={values.fechaTurno} pickTime={time => {
            setValues(prev => ({ ...prev, fechaTurno: time }));
            setErrors(prev => ({ ...prev, fechaTurno: '' }));
          }}
          busy={busy || checkingSlots} error={availabilityError || errors.fechaTurno}/>}
    </fieldset>;
    const options = field.options; const props = { id, name: field.key, value: values[field.key] || '', disabled: busy, required: !field.optional && !field.fixed, isInvalid: !!errors[field.key], 'aria-describedby': errors[field.key] ? `${id}-error` : undefined, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => { setValues(v => ({ ...v, [field.key]: event.target.value, ...(['medico', 'franja', 'paciente'].includes(field.key) ? { fechaTurno: '' } : {}) })); setErrors(old => { const next = { ...old }; delete next[field.key]; return next; }); } }; return <Form.Group key={field.key} className={field.wide ? 'field-wide' : ''}><Form.Label htmlFor={id}>{field.label}{field.fixed ? null : field.optional ? <span className="optional"> · opcional</span> : <span className="required-mark"> *</span>}</Form.Label>{field.fixed ? <Form.Control {...props} value={field.key === 'consultorio' && doctor?.consultorioAsignado
      ? 'Consultorio N.º ' + doctor.consultorioAsignado.numero + ' · ' + doctor.consultorioAsignado.ubicacion
      : field.fixed.label} readOnly/> : options || field.groups ? <Form.Select {...props}><option value="">Seleccioná una opción</option>{options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      {field.groups?.map(group => <optgroup key={group.label} label={group.label}>
        {group.options.map(option => <option key={option.value || option.label} value={option.value} disabled={!option.value || option.disabled}>{option.label}</option>)}
      </optgroup>)}</Form.Select> : field.type === 'textarea' ? <Form.Control {...props} as="textarea" rows={3} maxLength={field.key === 'observaciones' ? 500 : 300}/> : <Form.Control {...props} type={field.type || 'text'} placeholder={field.placeholder} inputMode={['dni', 'numero', 'direccion.numero', 'telefono.codigoArea', 'telefono.numero'].includes(field.key) ? 'numeric' : undefined}/>}<Form.Control.Feedback id={`${id}-error`} type="invalid">{errors[field.key]}</Form.Control.Feedback>
      {field.key === 'medico' && doctors.some(item => item.estado === 'de-licencia') && <div className="alert alert-danger mt-2 mb-0">
        <strong>Profesionales de licencia</strong>
        <ul className="mb-1">
          {doctors.filter(item => item.estado === 'de-licencia').map(item => <li key={item.id}>{item.nombre} {item.apellido}</li>)}
        </ul>
        <div>Durante la licencia, elegí otro profesional para solicitar un turno.</div>
      </div>}
      {field.key === 'medico' && doctor && <div className="mt-2">
        <strong>Horarios de atención</strong>
        {doctor.agenda ? <ul className="mb-0">
          {[...doctor.agenda].sort((a, b) => a.dia - b.dia || a.desde.localeCompare(b.desde)).map(slot =>
            <li key={slot.dia + '-' + slot.desde}>{weekdays.find(day => day.day === slot.dia)?.label} de {slot.desde} a {slot.hasta}</li>)}
        </ul> : <p className="muted mb-0">Lunes a viernes, de 08:00 a 12:00 y de 14:00 a 18:00.</p>}
      </div>}
    </Form.Group>; })}
    {entity === 'medicos' && <fieldset className="field-wide border rounded p-3" disabled={busy}>
      <legend className="fs-5 mb-2">Consultorio asignado</legend>
      {rooms.error && <ErrorNotice message={rooms.error} retry={rooms.refetch}/>}
      <Form.Group controlId="medico-consultorio">
        <Form.Label>Consultorio</Form.Label>
        <Form.Select value={roomChoice} onChange={event => setRoomChoice(event.target.value)}
          disabled={rooms.isLoading || !!rooms.error} isInvalid={!!errors.consultorioId}>
          <option value="">Sin asignar</option>
          {rooms.data?.map(room => <option key={room.id} value={room.id}>Consultorio N.º {room.numero} · {room.ubicacion}</option>)}
          <option value="nuevo">Registrar un consultorio nuevo</option>
        </Form.Select>
        <Form.Control.Feedback type="invalid">{errors.consultorioId}</Form.Control.Feedback>
      </Form.Group>
      {roomChoice === 'nuevo' && <div className="form-fields mt-3">
        {([
          ['numero', 'Número', 'Ej.: 1'],
          ['ubicacion', 'Ubicación', 'Ej.: Planta baja, sector A'],
          ['descripcion', 'Descripción (opcional)', 'Ej.: Primera puerta a la derecha'],
        ] as const).map(([key, label, placeholder]) => <Form.Group key={key} controlId={'consultorio-nuevo-' + key}>
          <Form.Label>{label}</Form.Label>
          <Form.Control name={'consultorioNuevo.' + key} value={newRoom[key]} placeholder={placeholder}
            inputMode={key === 'numero' ? 'numeric' : undefined} isInvalid={!!errors['consultorioNuevo.' + key]}
            onChange={event => setNewRoom(previous => ({ ...previous, [key]: event.target.value }))}/>
          <Form.Control.Feedback type="invalid">{errors['consultorioNuevo.' + key]}</Form.Control.Feedback>
        </Form.Group>)}
      </div>}
    </fieldset>}
    {entity === 'medicos' && <AgendaMedica slots={agenda} onChange={setAgenda} disabled={busy} error={errors.agenda}/>}
    </div><div className="form-actions"><Link to={`/${entity}`} className={`btn btn-outline-secondary ${busy ? 'disabled' : ''}`} aria-disabled={busy}>Cancelar</Link><Button type="submit" disabled={busy}>{busy ? 'Guardando…' : <><Check size={17}/> Guardar {referral ? 'derivación' : record ? 'cambios' : config.singular}</>}</Button></div></Form></section><aside className="form-help"><span className="record-icon teal"><Info size={21}/></span><h2>Los detalles hacen la diferencia.</h2><p>Los campos con asterisco son obligatorios. Revisá la información antes de guardar.</p>{entity === 'turnos' ? <p>Los turnos duran 30 minutos. El paciente, profesional y consultorio deben estar disponibles durante ese intervalo.</p> : <p>Los datos estarán disponibles en el listado apenas se confirme el guardado.</p>}<div className="help-divider"/><small>Este entorno educativo comienza con datos ficticios para practicar.</small></aside></div></>;
}
