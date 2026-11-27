import { notifyAppointmentSms } from './appointment-sms.mjs';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addCalendarDays, appointmentDate, appointmentMinutes, appointmentTimes, isScheduledAppointment } from '../shared/agenda.ts';
import { cancelarTurnoSchema, derivacionTurnoSchema, estadoMedicoSchema, estadoPacienteSchema, estadoTurnoSchema, eliminarSeleccionSchema, schemas } from '../shared/schemas.ts';
import { initializeAccounts, accountService } from './accounts.mjs';
import express from 'express';
import { openMongoStore } from './mongo-store.mjs';

if (existsSync('.env')) process.loadEnvFile('.env');
const mongoUri = process.env.DATA_FILE ? undefined : process.env.MONGODB_URI;
const frontendOrigin = process.env.FRONTEND_ORIGIN ? new URL(process.env.FRONTEND_ORIGIN).origin : undefined;
const servirWeb = process.env.SERVIR_WEB === '1';
if (servirWeb && !mongoUri) throw new Error('Definí MONGODB_URI para iniciar el servicio online.');

const dataPath = process.env.DATA_FILE || fileURLToPath(new URL('./data/salita.json', import.meta.url));
const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(9, 0, 0, 0);
const seed = {
  pacientes: [{ id: 'paciente-demo', nombre: 'Paciente', apellido: 'de ejemplo', dni: '99999999', email: 'paciente@example.test', telefono: { codigoArea: '3492', numero: '5550101' }, direccion: { calle: 'Calle de ejemplo', numero: '100', barrio: 'Centro' }, obraSocial: { nombre: 'Sin obra social', numeroAfiliado: '' } }],
  medicos: [{ id: 'medico-demo', nombre: 'Profesional', apellido: 'de ejemplo', matricula: 'DEMO-001', consultorioId: 'consultorio-demo', especialidad: 'Clínica médica', email: 'medico@example.test', telefono: { codigoArea: '3492', numero: '5550102' } }],
  consultorios: [{ id: 'consultorio-demo', nombre: 'Consultorio general', numero: '1', ubicacion: 'Planta baja', descripcion: 'Atención general' }],
  turnos: [{ id: 'turno-demo', paciente: 'paciente-demo', medico: 'medico-demo', consultorio: 'consultorio-demo', fechaTurno: tomorrow.toISOString(), estado: 'pendiente', observaciones: 'Registro ficticio para practicar.' }],
};
let store;
try {
  if (mongoUri) store = await openMongoStore(mongoUri, process.env.MONGODB_DATABASE || 'salita_municipal');
} catch (error) {
  const message = String(error.message);
  const category = error.name === 'MongoParseError' ? 'formato de la URI' :
    error.code === 18 || /bad auth|authentication failed/i.test(message) ? 'credenciales rechazadas por Atlas' :
    error.code === 13 || /not authorized|unauthorized/i.test(message) ? 'permisos insuficientes en la base' :
    /ENOTFOUND|ENODATA|ESERVFAIL|querySrv/i.test(message) ? 'el servidor DNS no pudo resolver el clúster' :
    error.name === 'MongoServerSelectionError' ? 'conexión de red o acceso por IP' :
    'error de conexión';
  throw new Error('MongoDB Atlas: ' + category + '.');
}

if (!store) mkdirSync(dirname(resolve(dataPath)), { recursive: true });
const localExists = !store && existsSync(dataPath);
const db = store
  ? store.data ?? { pacientes: [], medicos: [], consultorios: [], turnos: [] }
  : localExists ? JSON.parse(readFileSync(dataPath, 'utf8')) : structuredClone(seed);

async function save() {
  if (store) return store.save(db);
  writeFileSync(`${dataPath}.tmp`, JSON.stringify(db, null, 2));
  renameSync(`${dataPath}.tmp`, dataPath);
}
if (!db.usuarios && localExists) writeFileSync(`${dataPath}.before-accounts.json`, JSON.stringify(db, null, 2));
await initializeAccounts(db, save, Boolean(store));

const accounts = accountService(db, save, respond, readBody);
function respond(res, status, mensaje, data = null, errores) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ ok: status < 400, mensaje, data, ...(errores ? { errores } : {}) })); }
async function readBody(req) {
  let body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 65536) throw Object.assign(new Error('La petición es demasiado grande.'), { status: 413 }); }
  try { return JSON.parse(body || '{}'); } catch { throw Object.assign(new Error('El cuerpo debe ser JSON válido.'), { status: 400 }); }
}
function overlappingAppointments(date, excludedId) {
  const start = Date.parse(date);
  return db.turnos.filter(turno => turno.id !== excludedId && !turno.archivado && turno.estado === 'pendiente' &&
    Math.abs(Date.parse(turno.fechaTurno) - start) < appointmentMinutes * 60 * 1000);
}

function availableRoom(rooms, overlapping, requestedRoom) {
  return rooms.find(room => (!requestedRoom || room.id === requestedRoom) &&
    !overlapping.some(turno => turno.consultorio === room.id));
}

function populate(turno) { return { ...turno, salitaNombre: db.salitas.find(s => s.id === turno.salitaId)?.nombre, paciente: db.pacientes.find(x => x.id === turno.paciente) || null, medico: db.medicos.find(x => x.id === turno.medico) || null, consultorio: db.consultorios.find(x => x.id === turno.consultorio) || null, especialidad: db.medicos.find(x => x.id === turno.medico)?.especialidad || '' }; }
async function handleApi(req, res) {
  const origin = req.headers.origin;
  if (origin && (origin === frontendOrigin || (!frontendOrigin && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)))) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  try {
    const url = new URL(req.url || '/', 'http://localhost'); const path = url.pathname.replace(/\/$/, '');
    if (path === '/api/v1/health' && req.method === 'GET') return respond(res, 200, 'API disponible.', { storage: store ? 'mongodb' : 'json-local', educational: true });
    if (await accounts.publicRoute(path, req, res)) return;
    const actor = accounts.authenticate(req);
    if (!actor) return respond(res, 401, 'Tu sesión venció. Volvé a ingresar.');
    if (await accounts.privateRoute(path, req, res, actor)) return;
    const match = path.match(/^\/api\/v1\/(pacientes|medicos|consultorios|turnos)(?:\/([^/]+))?(?:\/(atender|estado|cancelar|derivar))?$/);
    if (!match) return respond(res, 404, 'La ruta no existe.');
    const [, entity, id, action] = match;
    const requestedSite = url.searchParams.get('salitaId');
    const availability = entity === 'turnos' && id === 'disponibilidad' && !action && req.method === 'GET';
    const patientCanChooseSite = actor.rol === 'cliente' && (!id || availability) &&
      ((req.method === 'GET' && (availability || ['medicos', 'consultorios'].includes(entity))) ||
       (req.method === 'POST' && entity === 'turnos'));
    const salitaId = actor.rol === 'superadmin' ? requestedSite :
      (patientCanChooseSite && requestedSite) || actor.salitaId;
    if (!salitaId || !db.salitas.some(s => !s.archivado && s.id === salitaId)) return respond(res, 400, 'Seleccioná una salita válida.');
    if (availability) {
      const doctor = db.medicos.find(row => row.id === url.searchParams.get('medico') && row.salitaId === salitaId && !row.archivado);
      const day = url.searchParams.get('desde') || '';
      const shift = url.searchParams.get('franja');
      const weekTime = Date.parse(day + 'T12:00:00Z');
      if (!doctor || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day < '2000-01-01' || day > '9998-12-31' ||
          !Number.isFinite(weekTime) || new Date(weekTime).toISOString().slice(0, 10) !== day ||
          !['TM', 'TT'].includes(shift)) {
        return respond(res, 400, 'Seleccioná un profesional, una fecha y un turno válidos.');
      }

      const original = actor.rol === 'admin' && db.turnos.find(row =>
        row.id === url.searchParams.get('derivar') && row.salitaId === salitaId && !row.archivado && row.estado === 'pendiente');
      const patientId = actor.rol === 'cliente' ? actor.pacienteId : original?.paciente ||
        db.pacientes.find(row => row.id === url.searchParams.get('paciente') && row.salitaId === salitaId && !row.archivado)?.id;
      const rooms = db.consultorios.filter(row => row.salitaId === salitaId && !row.archivado);
      const now = Date.now();
      const days = Array.from({ length: 7 }, (_, index) => {
        const date = addCalendarDays(day, index);
        const slots = appointmentTimes(date, shift, doctor.agenda).flatMap(time => {
          const startsAt = appointmentDate(date, time);
          if (Date.parse(startsAt) <= now) return [];
          const overlapping = overlappingAppointments(startsAt, original?.id);
          const free = Boolean(doctor.consultorioId) && doctor.estado !== 'de-licencia' && !overlapping.some(row => row.medico === doctor.id || row.paciente === patientId) &&
            Boolean(availableRoom(rooms, overlapping, doctor.consultorioId));
          return [{ time, available: free }];
        });
        return { day: date, slots };
      });
      return respond(res, 200, 'Disponibilidad consultada.', days);
    }
    const scoped = db[entity].filter(row => {
      if (row.archivado) return false;
      if (actor.rol === 'cliente' && entity === 'turnos') return row.paciente === actor.pacienteId;
      if (actor.rol === 'cliente' && entity === 'pacientes') return row.id === actor.pacienteId;
      return row.salitaId === salitaId;
    });
    if (entity === 'turnos' && id && action === 'cancelar' && req.method === 'PATCH') {
      if (actor.rol !== 'cliente') return respond(res, 403, 'Solo el paciente puede cancelar su turno desde el portal.');
      const record = scoped.find(row => row.id === id);
      if (!record) return respond(res, 404, 'No se encontró el turno.');
      const now = Date.now();
      if (record.estado !== 'pendiente' || Date.parse(record.fechaTurno) <= now) {
        return respond(res, 409, 'Solo podés cancelar turnos futuros que estén en espera.');
      }
      const parsed = cancelarTurnoSchema.safeParse(await readBody(req));
      if (!parsed.success) return respond(res, 400, 'Ingresá un motivo de hasta 300 caracteres.');

      const previous = { ...record };
      const previousBlock = actor.turnosBloqueadosHasta;
      const bloqueadoHasta = new Date(now + 24 * 60 * 60 * 1000).toISOString();
      record.estado = 'cancelado';
      record.motivoCancelacion = parsed.data.motivo;
      actor.turnosBloqueadosHasta = bloqueadoHasta;
      try { await save(); } catch (error) {
        record.estado = previous.estado;
        if (previous.motivoCancelacion === undefined) delete record.motivoCancelacion;
        else record.motivoCancelacion = previous.motivoCancelacion;
        if (previousBlock === undefined) delete actor.turnosBloqueadosHasta;
        else actor.turnosBloqueadosHasta = previousBlock;
        throw error;
      }
      return respond(res, 200, 'Turno cancelado.', { bloqueadoHasta });
    }
    if (actor.rol === 'cliente' && req.method !== 'GET' && !(entity === 'turnos' && req.method === 'POST' && !id)) return respond(res, 403, 'No tenés permisos para esta operación.');
    if (entity === 'medicos' && id && action === 'estado' && req.method === 'PATCH') {
      if (actor.rol !== 'admin') return respond(res, 403, 'Solo la administración de la salita puede cambiar este estado.');
      const doctor = scoped.find(row => row.id === id);
      if (!doctor) return respond(res, 404, 'No se encontró el médico.');
      const parsed = estadoMedicoSchema.safeParse(await readBody(req));
      if (!parsed.success) return respond(res, 400, 'Seleccioná un estado válido.');
      const previous = doctor.estado;
      doctor.estado = parsed.data.estado;
      try { await save(); } catch (error) {
        if (previous === undefined) delete doctor.estado;
        else doctor.estado = previous;
        throw error;
      }
      return respond(res, 200, 'Estado del médico actualizado.', { estado: doctor.estado });
    }
    if (!action && ((entity === 'pacientes' && req.method === 'PATCH' && id) || (req.method === 'DELETE' && !id))) {
      if (actor.rol !== 'admin') return respond(res, 403, 'Solo la administración de la salita puede modificar estas fichas.');
      const body = await readBody(req);

      if (req.method === 'PATCH') {
        const patient = scoped.find(row => row.id === id);
        if (!patient) return respond(res, 404, 'No se encontró el paciente.');
        const parsed = estadoPacienteSchema.safeParse(body);
        if (!parsed.success) return respond(res, 400, 'Seleccioná un estado válido.');
        const previous = patient.estado;
        patient.estado = parsed.data.estado;
        try { await save(); } catch (error) {
          if (previous === undefined) delete patient.estado;
          else patient.estado = previous;
          throw error;
        }
        return respond(res, 200, 'Estado actualizado.', { estado: patient.estado });
      }

      const parsed = eliminarSeleccionSchema.safeParse(body);
      if (!parsed.success) return respond(res, 400, 'Seleccioná al menos un registro.');
      const ids = new Set(parsed.data.ids);
      const selected = scoped.filter(row => ids.has(row.id));
      if (selected.length !== ids.size) return respond(res, 409, 'La selección cambió. Actualizá la lista y volvé a intentarlo.');
      if (entity === 'consultorios' && db.medicos.some(doctor => !doctor.archivado && ids.has(doctor.consultorioId))) {
        return respond(res, 409, 'Desasigná el consultorio de sus médicos antes de eliminarlo.');
      }
      for (const record of selected) record.archivado = true;
      try { await save(); } catch (error) {
        for (const record of selected) delete record.archivado;
        throw error;
      }
      return respond(res, 200, 'Registros eliminados del listado.', { cantidad: selected.length });
    }
    if (req.method === 'GET' && !action) {
      const selected = id ? scoped.filter(x => x.id === id) : url.searchParams.has('id') ? scoped.filter(x => x.id === url.searchParams.get('id')) : scoped;
      if (id && !selected.length) return respond(res, 404, 'No se encontró el registro.');
      let data = entity === 'turnos' ? selected.map(populate) : selected;
      if (entity === 'medicos') {
        data = selected.map(doctor => {
          const room = db.consultorios.find(item =>
            item.id === doctor.consultorioId && item.salitaId === doctor.salitaId && !item.archivado);
          const consultorioAsignado = room && { nombre: room.nombre, numero: room.numero, ubicacion: room.ubicacion };
          const { id, nombre, apellido, especialidad, agenda, estado } = doctor;
          return actor.rol === 'cliente'
            ? { id, nombre, apellido, especialidad, agenda, estado, consultorioAsignado }
            : { ...doctor, consultorioAsignado };
        });
      }
      if (entity === 'consultorios' && actor.rol === 'admin') {
        data = selected.map(room => ({
          ...room,
          medicosAsignados: db.medicos.filter(doctor =>
            !doctor.archivado && doctor.salitaId === room.salitaId && doctor.consultorioId === room.id)
            .map(doctor => ({ id: doctor.id, nombre: doctor.nombre + ' ' + doctor.apellido })),
        }));
      }
      return respond(res, 200, 'Consulta realizada.', id ? data[0] : data);
    }
    const editing = req.method === 'PATCH' && id && !action && ['medicos', 'consultorios'].includes(entity);
    const reassigning = entity === 'turnos' && id && action === 'derivar' && req.method === 'PATCH';
    if (editing || reassigning || (req.method === 'POST' && !id)) {
      const body = await readBody(req);
      const urgent = entity === 'turnos' && (reassigning || (body && Object.hasOwn(body, 'motivoDerivacion')));
      if (urgent && actor.rol !== 'admin') return respond(res, 403, 'Solo la administración de la salita puede derivar turnos.');
      const original = reassigning ? scoped.find(row => row.id === id) : undefined;
      if (reassigning && !original) return respond(res, 404, 'No se encontró el turno.');
      if (original && original.estado !== 'pendiente') return respond(res, 409, 'Solo se pueden derivar turnos en espera.');
      if (editing && actor.rol !== 'admin') return respond(res, 403, 'Solo la administración de la salita puede editar estos registros.');
      const existing = editing ? scoped.find(row => row.id === id) : undefined;
      if (editing && !existing) return respond(res, 404, 'No se encontró el registro.');
      const result = (urgent ? derivacionTurnoSchema : schemas[entity]).safeParse(body);
      if (!result.success) { const errors = {}; for (const issue of result.error.issues) errors[issue.path.join('.')] ??= issue.message; return respond(res, 400, 'Revisá los campos del formulario.', null, errors); }
      const { motivoDerivacion, consultorioNuevo, ...data } = result.data;
      if (original && original.paciente !== data.paciente) return respond(res, 400, 'La derivación debe corresponder al paciente del turno.');
      const derivacion = urgent ? {
        motivo: motivoDerivacion,
        administradorId: actor.id,
        administradorNombre: actor.nombre,
        fecha: new Date().toISOString(),
      } : undefined;
      const unique = { pacientes: 'dni', medicos: 'matricula', consultorios: 'numero' }[entity];
      if (unique && db[entity].some(x => x.id !== existing?.id && x.salitaId === salitaId && x[unique].toLowerCase() === data[unique].toLowerCase())) return respond(res, 409, 'Ya existe un registro con ese dato.', null, { [unique]: 'Este valor ya está registrado.' });
      let newRoom;
      if (entity === 'medicos') {
        const rooms = db.consultorios.filter(room => room.salitaId === salitaId);
        if (data.consultorioId && !rooms.some(room => room.id === data.consultorioId && !room.archivado)) {
          return respond(res, 400, 'El consultorio seleccionado no está disponible.', null, { consultorioId: 'Elegí un consultorio válido.' });
        }
        if (consultorioNuevo) {
          if (rooms.some(room => Number(room.numero) === Number(consultorioNuevo.numero))) {
            return respond(res, 409, 'Ya existe un consultorio con ese número.', null, { 'consultorioNuevo.numero': 'Este número ya está registrado.' });
          }
          newRoom = { ...consultorioNuevo, id: randomUUID(), salitaId };
          data.consultorioId = newRoom.id;
          db.consultorios.push(newRoom);
        }
      }
      if (existing) {
        const index = db[entity].indexOf(existing);
        const updated = { ...existing, ...data };
        db[entity][index] = updated;
        try { await save(); } catch (error) {
          db[entity][index] = existing;
          if (newRoom) db.consultorios.pop();
          throw error;
        }
        return respond(res, 200, 'Registro actualizado.', updated);
      }
      if (entity === 'turnos') {
        if (actor.rol === 'cliente' && Date.parse(actor.turnosBloqueadosHasta || '') > Date.now()) {
          return respond(res, 409, 'Todavía no podés solicitar otro turno. Consultá el contador en tu portal.', {
            bloqueadoHasta: actor.turnosBloqueadosHasta,
          });
        }
        if (actor.rol === 'cliente' && data.paciente !== actor.pacienteId) return respond(res, 403, 'Solo podés solicitar turnos para tu propia cuenta.');
        const errors = {};
        const patient = db.pacientes.find(x => x.id === data.paciente);
        if (!patient || patient.archivado || (actor.rol !== 'cliente' && !original && patient.salitaId !== salitaId)) errors.paciente = 'El paciente seleccionado no existe.';
        const doctor = db.medicos.find(x => x.id === data.medico && !x.archivado && x.salitaId === salitaId);
        if (!doctor) errors.medico = 'El médico seleccionado no atiende en esta salita.';
        if (doctor?.estado === 'de-licencia') return respond(res, 409, 'El médico está de licencia. Elegí otro profesional.');
        const rooms = db.consultorios.filter(x => !x.archivado && x.salitaId === salitaId);
        if (data.consultorio && !rooms.some(x => x.id === data.consultorio)) errors.consultorio = 'El consultorio seleccionado no existe en esta salita.';
        if (doctor?.agenda && !isScheduledAppointment(data.fechaTurno, doctor.agenda)) errors.fechaTurno = 'El médico no atiende ese día u horario.';
        else if (!data.consultorio && !isScheduledAppointment(data.fechaTurno)) errors.fechaTurno = 'Elegí un horario de TM o TT de lunes a viernes.';
        if (Object.keys(errors).length) return respond(res, 400, 'Revisá las selecciones.', null, errors);

        const overlapping = overlappingAppointments(data.fechaTurno, original?.id);
        const conflict = overlapping.some(x => x.medico === data.medico || x.paciente === data.paciente);
        if (conflict) return respond(res, 409, 'El paciente o el médico ya tiene un turno en ese horario. Elegí otro.');
        if (doctor.consultorioId && data.consultorio && doctor.consultorioId !== data.consultorio) {
          return respond(res, 400, 'Usá el consultorio asignado al profesional.');
        }
        if (!doctor.consultorioId) {
          return respond(res, 409, 'El profesional todavía no tiene un consultorio asignado.');
        }
        const available = availableRoom(rooms, overlapping, doctor.consultorioId);
        if (!available) return respond(res, 409, 'No hay consultorios libres en esta salita para ese horario.');
        data.consultorio = available.id;
      }
      if (original) {
        const index = db.turnos.indexOf(original);
        const updated = { ...original, ...data, fechaTurno: new Date(data.fechaTurno).toISOString(), derivacion };
        db.turnos[index] = updated;
        try { await save(); } catch (error) { db.turnos[index] = original; throw error; }
        return respond(res, 200, 'Turno derivado con urgencia.', populate(updated));
      }
      const record = { ...data, ...(derivacion ? { derivacion } : {}), id: randomUUID(), salitaId, ...(entity === 'turnos' ? { fechaTurno: new Date(data.fechaTurno).toISOString(), estado: 'pendiente' } : {}) };
      db[entity].push(record);
      try { await save(); } catch (error) {
        db[entity].pop();
        if (newRoom) db.consultorios.pop();
        throw error;
      }
      if (entity !== 'turnos') return respond(res, 201, 'Registro creado correctamente.', record);
      const appointment = populate(record);
      const sms = actor.rol === 'admin' ? await notifyAppointmentSms(appointment.paciente, appointment) : undefined;
      return respond(res, 201, 'Turno reservado.', { ...appointment, sms });
    }
    if (entity === 'turnos' && id && ['atender', 'estado'].includes(action) && req.method === 'PATCH') {
      const record = scoped.find(x => x.id === id); if (!record) return respond(res, 404, 'No se encontró el turno.');
      const parsed = estadoTurnoSchema.safeParse(action === 'atender' ? { estado: 'atendido' } : await readBody(req));
      if (!parsed.success) return respond(res, 400, 'Elegí un estado válido.');
      const { estado } = parsed.data;
      const previous = record.estado;
      if (estado === 'pendiente' && previous !== 'pendiente') {
        const conflict = db.turnos.some(x => x.id !== record.id && !x.archivado && x.estado === 'pendiente' &&
          Math.abs(Date.parse(x.fechaTurno) - Date.parse(record.fechaTurno)) < appointmentMinutes * 60 * 1000 &&
          (x.medico === record.medico || x.paciente === record.paciente || x.consultorio === record.consultorio));
        if (conflict) return respond(res, 409, 'Ese horario ya está ocupado para el paciente, el médico o el consultorio.');
      }
      record.estado = estado;
      try { await save(); } catch (error) { record.estado = previous; throw error; }
      return respond(res, 200, 'Estado del turno actualizado.', populate(record));
    }
    return respond(res, 405, 'Método no permitido.');
  } catch (error) { respond(res, error.status || 500, error.status ? error.message : 'No se pudo procesar la operación.'); }
}

const web = express();
web.disable('x-powered-by');
let pending = Promise.resolve();
web.use((req, res, next) => {
  if (req.path !== '/api' && !req.path.startsWith('/api/')) return next();
  if (req.path === '/api/v1/health' && req.method === 'GET') return handleApi(req, res);
  const previous = pending;
  pending = previous.then(() => res.destroyed ? undefined : handleApi(req, res)).catch(next);
});

if (servirWeb) {
  const dist = fileURLToPath(new URL('../dist', import.meta.url));
  if (!existsSync(resolve(dist, 'index.html'))) throw new Error('Compilá el frontend con npm run build.');
  web.use(express.static(dist));
  web.use((req, res, next) => {
    if (req.method !== 'GET' || !req.accepts('html') || req.path.includes('.')) return next();
    res.sendFile(resolve(dist, 'index.html'));
  });
}

const server = http.createServer({ requestTimeout: 15000 }, web);
const host = process.env.HOST || (servirWeb ? '0.0.0.0' : '127.0.0.1');
const port = Number(process.env.PORT || 3001);
server.listen(port, host, () => console.log('Salita Municipal disponible en el puerto ' + port + '.'));
server.on('error', error => { console.error(error.message); process.exit(1); });
