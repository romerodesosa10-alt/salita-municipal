import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { adminSchema, cambiarPasswordSchema, editarAdminSchema, estadoAdminSchema, registroSchema, salitaSchema } from '../shared/schemas.ts';
const derive = promisify(scrypt);
async function hash(password, salt = randomBytes(16).toString('hex')) { return { salt, hash: (await derive(password, salt, 64)).toString('hex') }; }
export async function initializeAccounts(db, save, mongo = false) {
  let changed = false;
  if (!db.salitas) { db.salitas = [{ id: 'salita-principal', nombre: 'Salita Municipal Central', direccion: 'Dirección a completar' }]; changed = true; }
  for (const sede of [
    { id: 'sala-sarmiento', nombre: 'Sala Sarmiento' },
    { id: 'caps-belgrano', nombre: 'CAPS Belgrano' },
    { id: 'caps-itaty', nombre: 'CAPS Itaty' },
  ]) {
    if (db.salitas.some(s => s.id === sede.id || s.nombre.toLowerCase() === sede.nombre.toLowerCase())) continue;
    db.salitas.push({ ...sede, direccion: 'Dirección a completar' });
    changed = true;
  }
  for (const entity of ['pacientes', 'medicos', 'consultorios', 'turnos']) for (const row of db[entity]) if (!row.salitaId) { row.salitaId = 'salita-principal'; changed = true; }
  if (!db.usuarios) {
    const superPassword = process.env.SUPERADMIN_PASSWORD;
    if (mongo && (!superPassword || superPassword.length < 16 || superPassword === 'SuperSalita2026!')) {
      throw new Error('Definí SUPERADMIN_PASSWORD con al menos 16 caracteres para inicializar MongoDB.');
    }
    db.usuarios = [
      ...(!mongo ? [{ id: randomUUID(), usuario: 'admin', nombre: 'Administración', email: 'admin@example.test', rol: 'admin', salitaId: 'salita-principal', pacienteId: null, password: await hash('Salita2026!') }] : []),
      { id: randomUUID(), usuario: 'superadmin', nombre: 'Superadministración', email: 'superadmin@example.test', rol: 'superadmin', salitaId: null, pacienteId: null, password: await hash(superPassword || 'SuperSalita2026!') },
    ]; changed = true;
  }
  if (changed) await save();
}
export function accountService(db, save, respond, readBody) {
  const sessions = new Map(); const attempts = new Map();
  const publicUser = user => ({ id: user.id, usuario: user.usuario, nombre: user.nombre, rol: user.rol, salitaId: user.salitaId, salitaNombre: db.salitas.find(x => x.id === user.salitaId)?.nombre || null, pacienteId: user.pacienteId });
  const adminView = user => ({ ...publicUser(user), email: user.email, bloqueado: Boolean(user.bloqueado) });
  function revokeSessions(userId, exceptToken) {
    for (const [token, session] of sessions) {
      if (session.userId === userId && token !== exceptToken) sessions.delete(token);
    }
  }
  const issueSession = user => { for (const [key, value] of sessions) if (value.expires < Date.now()) sessions.delete(key); const token = randomBytes(32).toString('hex'); sessions.set(token, { userId: user.id, expires: Date.now() + 8 * 3600000 }); return { token, usuario: publicUser(user) }; };
  const parse = (schema, data, res) => { const result = schema.safeParse(data); if (result.success) return result.data; const errors = {}; for (const issue of result.error.issues) errors[issue.path.join('.')] ??= issue.message; respond(res, 400, 'Revisá los campos.', null, errors); return null; };
  async function transaction(change) { const before = structuredClone(db); try { const result = change(); await save(); return result; } catch (error) { for (const key of Object.keys(db)) delete db[key]; Object.assign(db, before); throw error; } }
  const duplicate = data => db.usuarios.some(u => u.usuario === data.usuario || u.email.toLowerCase() === data.email.toLowerCase());
  async function createUser(data, role, res) {
    const password = await hash(data.password);
    // Revalidar después de la derivación asíncrona impide altas simultáneas duplicadas.
    if (!db.salitas.some(x => x.id === data.salitaId)) return respond(res, 400, 'La salita seleccionada no existe.');
    if (duplicate(data)) return respond(res, 409, 'Ese usuario o email ya está registrado.');
    if (role === 'cliente' && db.pacientes.some(p => p.salitaId === data.salitaId && p.dni === data.dni)) return respond(res, 409, 'No se puede completar el registro con estos datos. Contactá a la administración de tu salita para vincular tu ficha.');
    const record = await transaction(() => {
      const pacienteId = role === 'cliente' ? randomUUID() : null;
      if (pacienteId) db.pacientes.push({ id: pacienteId, salitaId: data.salitaId, nombre: data.nombre, apellido: data.apellido, dni: data.dni, email: data.email, telefono: { codigoArea: '', numero: '' }, direccion: { calle: '', numero: '', barrio: '' }, obraSocial: { nombre: data.cobertura, numeroAfiliado: '' } });
      const user = { id: randomUUID(), usuario: data.usuario, nombre: role === 'cliente' ? `${data.nombre} ${data.apellido}` : data.nombre, email: data.email, rol: role, salitaId: data.salitaId, pacienteId, password }; db.usuarios.push(user); return user;
    });
    return respond(res, 201, role === 'cliente' ? 'Tu cuenta fue creada.' : 'Administrador creado.', role === 'cliente' ? issueSession(record) : publicUser(record));
  }
  return {
    publicUser,
    authenticate(req) { const token = (req.headers.authorization || '').replace(/^Bearer /, ''); const session = sessions.get(token); if (!session || session.expires < Date.now()) { sessions.delete(token); return null; } return db.usuarios.find(x => x.id === session.userId && !x.bloqueado) || null; },
    async publicRoute(path, req, res) {
      if (path === '/api/v1/salitas/publicas' && req.method === 'GET') { respond(res, 200, 'Salitas disponibles.', db.salitas); return true; }
      if (!['/api/v1/auth/login', '/api/v1/auth/registro'].includes(path) || req.method !== 'POST') return false;
      const key = req.socket.remoteAddress || 'local'; const now = Date.now();
      for (const [key, entry] of attempts) if (entry.until < now) attempts.delete(key);
      const entry = attempts.get(key) || { count: 0, until: now + 15 * 60000 }; entry.count++; attempts.set(key, entry);
      if (entry.count > 60) { respond(res, 429, 'Demasiados intentos. Volvé a intentar en unos minutos.'); return true; }
      const body = await readBody(req);
      if (path.endsWith('/registro')) { const data = parse(registroSchema, body, res); if (data) await createUser(data, 'cliente', res); return true; }
      const username = typeof body?.usuario === 'string' ? body.usuario.trim().toLowerCase() : ''; const found = db.usuarios.find(u => u.usuario === username || u.email.toLowerCase() === username);
      const stored = found?.password || { salt: '00000000000000000000000000000000', hash: '00'.repeat(64) };
      const supplied = typeof body?.password === 'string' && body.password.length <= 128 ? body.password : '';
      const derived = await derive(supplied, stored.salt, 64);
      if (!found || !timingSafeEqual(derived, Buffer.from(stored.hash, 'hex'))) respond(res, 401, 'Los datos de ingreso son incorrectos.');
      else if (found.bloqueado) respond(res, 403, 'Esta cuenta está bloqueada. Contactá a superadministración.');
      else respond(res, 200, 'Sesión iniciada.', issueSession(found));
      return true;
    },
    async privateRoute(path, req, res, actor) {
      if (path === '/api/v1/auth/me' && req.method === 'GET') { respond(res, 200, 'Sesión válida.', publicUser(actor)); return true; }
      if (path === '/api/v1/auth/logout' && req.method === 'POST') { sessions.delete((req.headers.authorization || '').replace(/^Bearer /, '')); respond(res, 200, 'Sesión cerrada.'); return true; }
      if (path === '/api/v1/auth/password' && req.method === 'PATCH') {
        if (actor.rol !== 'admin') { respond(res, 403, 'Esta opción está disponible para administradores de salita.'); return true; }
        const data = parse(cambiarPasswordSchema, await readBody(req), res);
        if (!data) return true;

        const key = 'password:' + actor.id;
        const now = Date.now();
        const previous = attempts.get(key);
        const entry = previous?.until > now ? previous : { count: 0, until: now + 15 * 60000 };
        if (entry.count >= 10) { respond(res, 429, 'Demasiados intentos. Volvé a intentar en unos minutos.'); return true; }
        const current = await derive(data.actual, actor.password.salt, 64);
        if (!timingSafeEqual(current, Buffer.from(actor.password.hash, 'hex'))) {
          entry.count++;
          attempts.set(key, entry);
          respond(res, 400, 'La contraseña actual es incorrecta.', null, { actual: 'Revisá tu contraseña actual.' });
          return true;
        }

        const password = await hash(data.nueva);
        await transaction(() => { actor.password = password; });
        attempts.delete(key);
        const activeToken = (req.headers.authorization || '').replace(/^Bearer /, '');
        revokeSessions(actor.id, activeToken);
        respond(res, 200, 'Contraseña actualizada.');
        return true;
      }
      if (!path.startsWith('/api/v1/superadmin')) return false;
      if (actor.rol !== 'superadmin') { respond(res, 403, 'Solo el superadministrador puede acceder a este portal.'); return true; }
      if (path === '/api/v1/superadmin/salitas' && req.method === 'GET') { respond(res, 200, 'Salitas.', db.salitas.map(s => ({ ...s, administradores: db.usuarios.filter(u => u.salitaId === s.id && u.rol === 'admin').length }))); return true; }
      if (path === '/api/v1/superadmin/salitas' && req.method === 'POST') { const data = parse(salitaSchema, await readBody(req), res); if (data) { if (db.salitas.some(s => s.nombre.toLowerCase() === data.nombre.toLowerCase())) respond(res, 409, 'Ya existe una salita con ese nombre.'); else { const row = { ...data, id: randomUUID() }; await transaction(() => db.salitas.push(row)); respond(res, 201, 'Salita creada.', row); } } return true; }
      if (path === '/api/v1/superadmin/usuarios' && req.method === 'GET') { respond(res, 200, 'Administradores.', db.usuarios.filter(u => u.rol === 'admin').map(adminView)); return true; }
      if (path === '/api/v1/superadmin/administradores' && req.method === 'POST') { const data = parse(adminSchema, await readBody(req), res); if (data) await createUser(data, 'admin', res); return true; }
      const adminId = path.match(/^\/api\/v1\/superadmin\/administradores\/([\w-]+)$/)?.[1];
      if (adminId && ['PATCH', 'DELETE'].includes(req.method)) {
        const target = db.usuarios.find(user => user.id === adminId && user.rol === 'admin');
        if (!target) { respond(res, 404, 'No encontramos ese administrador.'); return true; }

        if (req.method === 'DELETE') {
          await transaction(() => { db.usuarios = db.usuarios.filter(user => user.id !== target.id); });
          revokeSessions(target.id);
          respond(res, 200, 'Administrador eliminado.');
          return true;
        }

        const body = await readBody(req);
        if (body && Object.hasOwn(body, 'bloqueado')) {
          const data = parse(estadoAdminSchema, body, res);
          if (!data) return true;
          await transaction(() => { target.bloqueado = data.bloqueado; });
          if (data.bloqueado) revokeSessions(target.id);
          respond(res, 200, data.bloqueado ? 'Administrador bloqueado.' : 'Administrador desbloqueado.', adminView(target));
          return true;
        }

        const data = parse(editarAdminSchema, body, res);
        if (!data) return true;
        if (!db.salitas.some(site => site.id === data.salitaId)) {
          respond(res, 400, 'La salita seleccionada no existe.', null, { salitaId: 'Elegí una salita registrada.' });
          return true;
        }
        if (db.usuarios.some(user => user.id !== target.id &&
          (user.usuario === data.usuario || user.email.toLowerCase() === data.email.toLowerCase()))) {
          respond(res, 409, 'Ese usuario o email ya está registrado.');
          return true;
        }

        const changedSite = target.salitaId !== data.salitaId;
        await transaction(() => Object.assign(target, data));
        if (changedSite) revokeSessions(target.id);
        respond(res, 200, 'Administrador actualizado.', adminView(target));
        return true;
      }
      respond(res, 404, 'La ruta no existe.'); return true;
    },
  };
}
