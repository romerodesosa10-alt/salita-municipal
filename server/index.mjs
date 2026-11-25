import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appointmentMinutes, isScheduledAppointment } from '../shared/agenda.ts';
import { schemas } from '../shared/schemas.ts';
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
  medicos: [{ id: 'medico-demo', nombre: 'Profesional', apellido: 'de ejemplo', matricula: 'DEMO-001', especialidad: 'Clínica médica', email: 'medico@example.test', telefono: { codigoArea: '3492', numero: '5550102' } }],
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
function populate(turno) { return { ...turno, salitaNombre: db.salitas.find(s => s.id === turno.salitaId)?.nombre, paciente: db.pacientes.find(x => x.id === turno.paciente) || null, medico: db.medicos.find(x => x.id === turno.medico) || null, consultorio: db.consultorios.find(x => x.id === turno.consultorio) || null, especialidad: db.medicos.find(x => x.id === turno.medico)?.especialidad || '' }; }
async function handleApi(req, res) {
  const origin = req.headers.origin;
  if (origin && (origin === frontendOrigin || (!frontendOrigin && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)))) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  try {
    const url = new URL(req.url || '/', 'http://localhost'); const path = url.pathname.replace(/\/$/, '');
    if (path === '/api/v1/health' && req.method === 'GET') return respond(res, 200, 'API disponible.', { storage: store ? 'mongodb' : 'json-local', educational: true });
    if (await accounts.publicRoute(path, req, res)) return;
    const actor = accounts.authenticate(req);
    if (!actor) return respond(res, 401, 'Tu sesión venció. Volvé a ingresar.');
    if (await accounts.privateRoute(path, req, res, actor)) return;
    const match = path.match(/^\/api\/v1\/(pacientes|medicos|consultorios|turnos)(?:\/([^/]+))?(?:\/(atender))?$/);
    if (!match) return respond(res, 404, 'La ruta no existe.');
    const [, entity, id, action] = match;
    const requestedSite = url.searchParams.get('salitaId');
    const patientCanChooseSite = actor.rol === 'cliente' && !id &&
      ((req.method === 'GET' && ['medicos', 'consultorios'].includes(entity)) ||
       (req.method === 'POST' && entity === 'turnos'));
    const salitaId = actor.rol === 'superadmin' ? requestedSite :
      (patientCanChooseSite && requestedSite) || actor.salitaId;
    if (!salitaId || !db.salitas.some(s => s.id === salitaId)) return respond(res, 400, 'Seleccioná una salita válida.');
    const scoped = db[entity].filter(row => {
      if (actor.rol === 'cliente' && entity === 'turnos') return row.paciente === actor.pacienteId;
      if (actor.rol === 'cliente' && entity === 'pacientes') return row.id === actor.pacienteId;
      return row.salitaId === salitaId;
    });
    if (actor.rol === 'cliente' && req.method !== 'GET' && !(entity === 'turnos' && req.method === 'POST' && !id)) return respond(res, 403, 'No tenés permisos para esta operación.');
    if (req.method === 'GET' && !action) {
      const selected = id ? scoped.filter(x => x.id === id) : url.searchParams.has('id') ? scoped.filter(x => x.id === url.searchParams.get('id')) : scoped;
      if (id && !selected.length) return respond(res, 404, 'No se encontró el registro.');
      let data = entity === 'turnos' ? selected.map(populate) : selected;
      if (actor.rol === 'cliente' && entity === 'medicos') data = selected.map(({ id, nombre, apellido, especialidad }) => ({ id, nombre, apellido, especialidad }));
      return respond(res, 200, 'Consulta realizada.', id ? data[0] : data);
    }
    if (req.method === 'POST' && !id) {
      const result = schemas[entity].safeParse(await readBody(req));
      if (!result.success) { const errors = {}; for (const issue of result.error.issues) errors[issue.path.join('.')] ??= issue.message; return respond(res, 400, 'Revisá los campos del formulario.', null, errors); }
      const data = result.data;
      const unique = { pacientes: 'dni', medicos: 'matricula', consultorios: 'numero' }[entity];
      if (unique && db[entity].some(x => x.salitaId === salitaId && x[unique].toLowerCase() === data[unique].toLowerCase())) return respond(res, 409, 'Ya existe un registro con ese dato.', null, { [unique]: 'Este valor ya está registrado.' });
      if (entity === 'turnos') {
        if (actor.rol === 'cliente' && data.paciente !== actor.pacienteId) return respond(res, 403, 'Solo podés solicitar turnos para tu propia cuenta.');
        const errors = {};
        const patient = db.pacientes.find(x => x.id === data.paciente);
        if (!patient || (actor.rol !== 'cliente' && patient.salitaId !== salitaId)) errors.paciente = 'El paciente seleccionado no existe.';
        if (!db.medicos.some(x => x.id === data.medico && x.salitaId === salitaId)) errors.medico = 'El médico seleccionado no atiende en esta salita.';
        const rooms = db.consultorios.filter(x => x.salitaId === salitaId);
        if (data.consultorio && !rooms.some(x => x.id === data.consultorio)) errors.consultorio = 'El consultorio seleccionado no existe en esta salita.';
        if (!data.consultorio && !isScheduledAppointment(data.fechaTurno)) errors.fechaTurno = 'Elegí un horario de TM o TT de lunes a viernes.';
        if (Object.keys(errors).length) return respond(res, 400, 'Revisá las selecciones.', null, errors);

        const startTime = Date.parse(data.fechaTurno);
        const overlapping = db.turnos.filter(x => x.estado === 'pendiente' &&
          Math.abs(Date.parse(x.fechaTurno) - startTime) < appointmentMinutes * 60 * 1000);
        const conflict = overlapping.some(x => x.medico === data.medico || x.paciente === data.paciente);
        if (conflict) return respond(res, 409, 'El paciente o el médico ya tiene un turno en ese horario. Elegí otro.');
        const available = rooms.find(room => (!data.consultorio || room.id === data.consultorio) &&
          !overlapping.some(x => x.consultorio === room.id));
        if (!available) return respond(res, 409, 'No hay consultorios libres en esta salita para ese horario.');
        data.consultorio = available.id;
      }
      const record = { ...data, id: randomUUID(), salitaId, ...(entity === 'turnos' ? { fechaTurno: new Date(data.fechaTurno).toISOString(), estado: 'pendiente' } : {}) };
      db[entity].push(record); try { await save(); } catch (error) { db[entity].pop(); throw error; }
      return respond(res, 201, 'Registro creado correctamente.', entity === 'turnos' ? populate(record) : record);
    }
    if (entity === 'turnos' && id && action === 'atender' && req.method === 'PATCH') {
      const record = scoped.find(x => x.id === id); if (!record) return respond(res, 404, 'No se encontró el turno.');
      const previous = record.estado; record.estado = 'atendido'; try { await save(); } catch (error) { record.estado = previous; throw error; }
      return respond(res, 200, 'Turno marcado como atendido.', populate(record));
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
