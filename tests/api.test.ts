import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { rmSync, readFileSync } from 'node:fs';
const port = 3100 + Math.floor(Math.random() * 1000); const base = `http://127.0.0.1:${port}/api/v1`;
const dataFile = resolve('server/data', `salita-api-test-${randomUUID()}.json`); let child: ChildProcess; let token = '';
async function request(path: string, method = 'GET', body?: unknown, auth = true) { return fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
async function start() {
  child = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(port), DATA_FILE: dataFile, SUPERADMIN_PASSWORD: 'SuperSalita2026!', SERVIR_WEB: '0' }, stdio: 'pipe' });
  let output = ''; child.stderr?.on('data', b => { output += b; });
  for (let i = 0; i < 80; i++) { if (child.exitCode !== null) throw new Error(output || 'El backend no arrancó.'); try { if ((await request('/health', 'GET', undefined, false)).ok) return; } catch {} await new Promise(r => setTimeout(r, 100)); } throw new Error('La API no respondió.');
}
async function stop() { if (child.exitCode === null) { const done = new Promise<void>(resolve => child.once('exit', () => resolve())); child.kill(); await done; } }
async function login() { const res = await request('/auth/login', 'POST', { usuario: 'admin', password: 'Salita2026!' }, false); const json = await res.json(); token = json.data.token; return res; }
beforeAll(start);
afterAll(async () => { await stop(); rmSync(dataFile, { force: true }); rmSync(`${dataFile}.tmp`, { force: true }); });
describe('API: autenticación, validaciones y persistencia', () => {
  it('rechaza consultas sin sesión y contraseñas incorrectas', async () => { expect((await request('/pacientes', 'GET', undefined, false)).status).toBe(401); expect((await request('/auth/login', 'POST', { usuario: 'admin', password: 'incorrecta' }, false)).status).toBe(401); });
  it('crea una sesión y valida el token en el servidor', async () => { expect((await login()).status).toBe(200); const res = await request('/auth/me'); expect(res.status).toBe(200); expect((await res.json()).data.usuario).toBe('admin'); });
  it('valida los cuatro formularios también en el servidor', async () => { for (const entity of ['pacientes', 'medicos', 'consultorios', 'turnos']) { const res = await request(`/${entity}`, 'POST', {}); expect(res.status).toBe(400); expect(Object.keys((await res.json()).errores).length).toBeGreaterThan(0); } });
  it('crea las cuatro entidades, impide duplicados y solapamientos y conserva los datos al reiniciar', async () => {
    const p = { nombre: 'Prueba', apellido: 'Automatizada', dni: '88888888', email: 'prueba@example.test', telefono: { codigoArea: '11', numero: '55555555' }, direccion: { calle: 'Pruebas', numero: '12', barrio: 'Centro' }, obraSocial: { nombre: 'Ninguna', numeroAfiliado: '' } };
    const m = { nombre: 'Médica', apellido: 'Prueba', matricula: 'TEST-001', especialidad: 'General', email: 'medica@example.test', telefono: p.telefono };
    const c = { nombre: 'Consultorio de prueba', numero: '9', ubicacion: 'Planta baja', descripcion: '' };
    const created: Record<string, string> = {};
    for (const [entity, body] of [['pacientes', p], ['medicos', m], ['consultorios', c]] as const) { const res = await request(`/${entity}`, 'POST', body); expect(res.status).toBe(201); created[entity] = (await res.json()).data.id; expect((await request(`/${entity}`, 'POST', body)).status).toBe(409); }
    const body = { paciente: created.pacientes, medico: created.medicos, consultorio: created.consultorios, fechaTurno: new Date(Date.now() + 86400000 * 3).toISOString(), observaciones: 'Prueba' };
    expect((await request('/turnos', 'POST', { ...body, paciente: 'inexistente' })).status).toBe(400);
    const res = await request('/turnos', 'POST', body); expect(res.status).toBe(201); const turno = (await res.json()).data;
    expect(turno.paciente.dni).toBe(p.dni); expect(turno.medico.matricula).toBe(m.matricula);
    expect((await request('/turnos', 'POST', { ...body, fechaTurno: new Date(Date.parse(body.fechaTurno) + 15 * 60000).toISOString() })).status).toBe(409);
    expect((await request('/turnos', 'POST', { ...body, fechaTurno: '2000-01-01T09:00:00Z' })).status).toBe(400);
    expect((await request(`/turnos/${turno.id}/atender`, 'PATCH')).status).toBe(200);
    await stop(); await start(); expect((await request('/pacientes')).status).toBe(401); await login();
    const saved = await request(`/turnos/${turno.id}`); expect(saved.status).toBe(200); expect((await saved.json()).data.estado).toBe('atendido');
  });
  it('separa roles, salitas y datos personales; guarda las cuentas sin contraseñas en texto', async () => {
    async function as(auth: string, path: string, method = 'GET', body?: unknown) { return fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
    async function signIn(usuario: string, password: string) { const r = await request('/auth/login', 'POST', { usuario, password }, false); expect(r.status).toBe(200); return (await r.json()).data.token as string; }
    const root = await signIn('superadmin', 'SuperSalita2026!');
    expect((await request('/superadmin/salitas')).status).toBe(403);
    const sr = await as(root, '/superadmin/salitas', 'POST', { nombre: 'Salita aislada', direccion: 'Calle de prueba 100' }); expect(sr.status).toBe(201); const salita = (await sr.json()).data;
    const newAdmin = { nombre: 'Admin aislado', email: 'admin-aislado@example.test', usuario: 'admin-aislado', password: 'PruebasAdmin2026!', salitaId: salita.id };
    expect((await as(root, '/superadmin/administradores', 'POST', newAdmin)).status).toBe(201);
    const otherAdmin = await signIn(newAdmin.usuario, newAdmin.password);
    expect((await (await as(otherAdmin, '/pacientes?salitaId=salita-principal')).json()).data).toEqual([]);
    const data = { nombre: 'Cliente', apellido: 'Prueba', dni: '66666666', email: 'cliente-prueba@example.test', usuario: 'cliente-prueba', password: 'ClientePrueba2026!', salitaId: 'salita-principal' };
    expect((await request('/auth/registro', 'POST', { ...data, rol: 'superadmin' }, false)).status).toBe(400);
    const registered = await request('/auth/registro', 'POST', data, false); expect(registered.status).toBe(201); const account = (await registered.json()).data; expect(account.usuario.rol).toBe('cliente'); expect(account.usuario.password).toBeUndefined();
    expect((await request('/auth/registro', 'POST', data, false)).status).toBe(409);
    const own = await (await as(account.token, '/pacientes')).json(); expect(own.data).toHaveLength(1); expect(own.data[0].id).toBe(account.usuario.pacienteId);
    expect((await as(account.token, '/pacientes', 'POST', {})).status).toBe(403);
    expect((await as(account.token, '/superadmin/usuarios')).status).toBe(403);
    expect((await (await as(account.token, '/medicos')).json()).data[0].email).toBeUndefined();
    const payload = { paciente: 'paciente-demo', medico: 'medico-demo', consultorio: 'consultorio-demo', fechaTurno: new Date(Date.now()+10*86400000).toISOString(), observaciones: '' };
    expect((await as(account.token, '/turnos', 'POST', payload)).status).toBe(403);
    const booking = await as(account.token, '/turnos', 'POST', { ...payload, paciente: account.usuario.pacienteId }); expect(booking.status).toBe(201); const turno = (await booking.json()).data;
    expect((await as(account.token, `/turnos/${turno.id}/atender`, 'PATCH')).status).toBe(403);
    expect((await as(otherAdmin, `/turnos/${turno.id}`)).status).toBe(404);
    expect((await as(otherAdmin, '/turnos', 'POST', { ...payload, paciente: account.usuario.pacienteId })).status).toBe(400);
    const other = { ...data, usuario: 'cliente-dos', email: 'cliente-dos@example.test', dni: '55555555' }; const second = await (await request('/auth/registro', 'POST', other, false)).json();
    expect((await as(second.data.token, `/turnos/${turno.id}`)).status).toBe(404); expect((await (await as(second.data.token, '/turnos')).json()).data).toEqual([]);
    const repeated = { ...data, usuario: 'concurrente', email: 'concurrente@example.test', dni: '44444444' };
    const concurrent = await Promise.all([request('/auth/registro', 'POST', repeated, false), request('/auth/registro', 'POST', repeated, false)]); expect(concurrent.map(r => r.status).sort()).toEqual([201,409]);
    const disk = readFileSync(dataFile, 'utf8'); expect(disk).not.toContain(data.password); expect(disk).not.toContain(newAdmin.password); expect(disk).toContain('salt');
    await stop(); await start(); const restored = await signIn(data.usuario, data.password); expect((await (await as(restored, '/turnos')).json()).data).toHaveLength(1); await login();
  });
  it('edita, bloquea, desbloquea y elimina cuentas de administración', async () => {
    const signIn = async (usuario: string, password: string) => {
      const response = await request('/auth/login', 'POST', { usuario, password }, false);
      return { status: response.status, token: (await response.json()).data?.token };
    };
    const superSession = await signIn('superadmin', 'SuperSalita2026!');
    expect(superSession.status).toBe(200);
    token = superSession.token;
    const response = await request('/superadmin/administradores', 'POST', {
      nombre: 'Administración de prueba', usuario: 'admin-gestion', email: 'gestion@example.test',
      password: 'GestionPrueba2026!', salitaId: 'salita-principal',
    });
    expect(response.status).toBe(201);
    const admin = (await response.json()).data;
    const path = '/superadmin/administradores/' + admin.id;
    const adminSession = await signIn('admin-gestion', 'GestionPrueba2026!');
    expect(adminSession.status).toBe(200);

    token = adminSession.token;
    expect((await request(path, 'PATCH', { bloqueado: true })).status).toBe(403);
    token = superSession.token;

    const edited = await request(path, 'PATCH', {
      nombre: 'Administración actualizada', usuario: 'admin-editado',
      email: 'editado@example.test', salitaId: 'salita-principal',
    });
    expect(edited.status).toBe(200);
    expect((await edited.json()).data.usuario).toBe('admin-editado');
    expect((await request(path, 'PATCH', { bloqueado: true })).status).toBe(200);
    expect((await signIn('admin-editado', 'GestionPrueba2026!')).status).toBe(403);
    token = adminSession.token;
    expect((await request('/auth/me')).status).toBe(401);

    token = superSession.token;
    expect((await request(path, 'PATCH', { bloqueado: false })).status).toBe(200);
    const restored = await signIn('admin-editado', 'GestionPrueba2026!');
    expect(restored.status).toBe(200);
    expect((await request(path, 'DELETE')).status).toBe(200);
    expect((await signIn('admin-editado', 'GestionPrueba2026!')).status).toBe(401);
    token = restored.token;
    expect((await request('/auth/me')).status).toBe(401);
    await login();
  });
  it('restablece la contraseña de un administrador y revoca su sesión', async () => {
    const signIn = (usuario: string, password: string) => request('/auth/login', 'POST', { usuario, password }, false);
    const superSession = await signIn('superadmin', 'SuperSalita2026!');
    token = (await superSession.json()).data.token;
    const response = await request('/superadmin/administradores', 'POST', {
      nombre: 'Administración de prueba', usuario: 'admin-recuperacion', email: 'recuperacion@example.test',
      password: 'AnteriorPrueba2026!', salitaId: 'salita-principal',
    });
    expect(response.status).toBe(201);
    const path = '/superadmin/administradores/' + (await response.json()).data.id;
    const admin = await signIn('admin-recuperacion', 'AnteriorPrueba2026!');
    const adminToken = (await admin.json()).data.token;
    const superToken = token;
    token = adminToken;
    expect((await request(path, 'PATCH', { nueva: 'NuevaPrueba2026!' })).status).toBe(403);
    token = superToken;
    expect((await request(path, 'PATCH', { nueva: 'AnteriorPrueba2026!' })).status).toBe(400);
    expect((await request(path, 'PATCH', { nueva: 'NuevaPrueba2026!' })).status).toBe(200);
    token = adminToken;
    expect((await request('/auth/me')).status).toBe(401);
    expect((await signIn('admin-recuperacion', 'AnteriorPrueba2026!')).status).toBe(401);
    expect((await signIn('admin-recuperacion', 'NuevaPrueba2026!')).status).toBe(200);
    await login();
  });
  it('cierra la sesión e invalida el token en el backend', async () => { expect((await request('/auth/logout', 'POST')).status).toBe(200); expect((await request('/pacientes')).status).toBe(401); });
  it('aplica la agenda semanal del médico al reservar un turno', async () => {
    await login();
    const medico = {
      nombre: 'Médico', apellido: 'Agenda', matricula: 'MP-AGENDA', especialidad: 'Clínica médica',
      email: 'agenda@example.test', telefono: { codigoArea: '11', numero: '55555555' },
    };
    const agenda = [{ dia: 2, desde: '09:00', hasta: '10:00' }];
    expect((await request('/medicos', 'POST', { ...medico, agenda: [{ ...agenda[0], hasta: '15:00' }] })).status).toBe(400);
    const created = await request('/medicos', 'POST', { ...medico, agenda });
    expect(created.status).toBe(201);
    const doctor = (await created.json()).data;
    expect(doctor.agenda).toEqual(agenda);
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + 7);
    while (date.getUTCDay() !== 2) date.setUTCDate(date.getUTCDate() + 1);
    const day = date.toISOString().slice(0, 10);
    const data = { medico: doctor.id, paciente: 'paciente-demo', observaciones: '' };
    expect((await request('/turnos', 'POST', { ...data, fechaTurno: day + 'T10:00:00-03:00' })).status).toBe(400);
    expect((await request('/turnos', 'POST', { ...data, fechaTurno: day + 'T09:30:00-03:00' })).status).toBe(201);
  });
  it('actualiza el estado y quita fichas en lote conservando los turnos', async () => {
    await login();
    const record = {
      nombre: 'Paciente', apellido: 'Archivo', dni: '77778123', email: 'archivo@example.test',
      telefono: { codigoArea: '11', numero: '55555555' },
      direccion: { calle: 'Prueba', numero: '1', barrio: 'Centro' },
      obraSocial: { nombre: 'Particular', numeroAfiliado: '' },
    };
    const created = await request('/pacientes', 'POST', record);
    expect(created.status).toBe(201);
    const id = (await created.json()).data.id;

    expect((await request('/pacientes/' + id, 'PATCH', { estado: 'atendido' })).status).toBe(200);
    const updated = await request('/pacientes/' + id);
    expect((await updated.json()).data.estado).toBe('atendido');
    expect((await request('/pacientes/' + id, 'PATCH', { estado: 'inválido' })).status).toBe(400);

    expect((await request('/pacientes', 'DELETE', { ids: [id, 'inexistente'] })).status).toBe(409);
    expect((await request('/pacientes/' + id)).status).toBe(200);
    expect((await request('/pacientes', 'DELETE', { ids: [id, 'paciente-demo'] })).status).toBe(200);
    expect((await request('/pacientes/' + id)).status).toBe(404);
    expect((await request('/pacientes/paciente-demo')).status).toBe(404);
    const historical = await request('/turnos/turno-demo');
    expect((await historical.json()).data.paciente.id).toBe('paciente-demo');

    await stop(); await start(); await login();
    expect((await request('/pacientes/' + id)).status).toBe(404);
  });
});
