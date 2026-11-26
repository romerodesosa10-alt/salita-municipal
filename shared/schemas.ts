import { z } from 'zod';

const text = (label: string) => z.string().trim().min(2, `${label}: ingresá al menos 2 caracteres.`).max(120, `${label}: máximo 120 caracteres.`);
const email = z.string().trim().email('Ingresá un email válido.').max(150);
const phone = z.object({ codigoArea: z.string().trim().regex(/^\d{2,5}$/, 'Código de área: entre 2 y 5 números.'), numero: z.string().trim().regex(/^\d{6,10}$/, 'Teléfono: entre 6 y 10 números.') });
export const loginSchema = z.object({ usuario: z.string().trim().min(1, 'Ingresá tu usuario o correo.'), password: z.string().min(1, 'Ingresá tu contraseña.') });
export const obrasSociales = ['Particular', 'IOMA', 'PAMI', 'OSDE', 'OSECAC', 'UPCN', 'OSPE', 'Unión Personal', 'Otra obra social'] as const;
export const pacienteSchema = z.object({
  nombre: text('Nombre'), apellido: text('Apellido'), dni: z.string().trim().regex(/^\d{7,8}$/, 'El DNI debe tener 7 u 8 números.'), email, telefono: phone,
  direccion: z.object({ calle: text('Calle'), numero: z.string().trim().regex(/^\d{1,6}$/, 'Ingresá una altura válida.'), barrio: text('Barrio') }),
  obraSocial: z.object({ nombre: text('Obra social'), numeroAfiliado: z.string().trim().max(50) }),
});
export const medicoSchema = z.object({ nombre: text('Nombre'), apellido: text('Apellido'), matricula: z.string().trim().min(3, 'La matrícula debe tener al menos 3 caracteres.').max(30), especialidad: text('Especialidad'), email, telefono: phone });
export const consultorioSchema = z.object({ nombre: text('Nombre del consultorio'), numero: z.string().trim().regex(/^\d{1,4}$/, 'Ingresá un número de consultorio válido.'), ubicacion: text('Ubicación'), descripcion: z.string().trim().max(300, 'Máximo 300 caracteres.') });
export const turnoSchema = z.object({ paciente: z.string().min(1, 'Seleccioná un paciente.'), medico: z.string().min(1, 'Seleccioná un médico.'), consultorio: z.string().min(1).optional(), fechaTurno: z.string().refine(s => Number.isFinite(Date.parse(s)), 'Ingresá una fecha y hora válida.').refine(s => Date.parse(s) > Date.now(), 'El turno debe ser a futuro.'), observaciones: z.string().trim().max(500, 'Máximo 500 caracteres.') });
export const schemas = { pacientes: pacienteSchema, medicos: medicoSchema, consultorios: consultorioSchema, turnos: turnoSchema };
export type Entity = keyof typeof schemas;
export type PacienteInput = z.infer<typeof pacienteSchema>;
export type MedicoInput = z.infer<typeof medicoSchema>;
export type ConsultorioInput = z.infer<typeof consultorioSchema>;
export type TurnoInput = z.infer<typeof turnoSchema>;
export interface Paciente extends PacienteInput { id: string }
export interface Medico extends MedicoInput { id: string }
export interface Consultorio extends ConsultorioInput { id: string }
export interface ITurno { id: string; salitaNombre?: string; paciente: Paciente | null; medico: Medico | null; consultorio: Consultorio | null; fechaTurno: string; estado: 'pendiente' | 'atendido'; especialidad: string; observaciones: string }
export interface EntityMap { pacientes: Paciente; medicos: Medico; consultorios: Consultorio; turnos: ITurno }
export type Role = 'superadmin' | 'admin' | 'cliente';
export interface User { id: string; nombre: string; usuario: string; rol: Role; salitaId: string | null; salitaNombre: string | null; pacienteId: string | null }
export interface Salita { id: string; nombre: string; direccion: string }
const username = z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/, 'Usuario: entre 3 y 40 letras, números, puntos, guiones o guiones bajos.');
const password = z.string().min(10, 'La contraseña debe tener al menos 10 caracteres.').max(128, 'Máximo 128 caracteres.');
export const cambiarPasswordSchema = z.object({
  actual: z.string().min(1, 'Ingresá tu contraseña actual.').max(128),
  nueva: password,
}).strict().refine(data => data.actual !== data.nueva, {
  path: ['nueva'], message: 'Elegí una contraseña distinta de la actual.',
});
export const registroSchema = z.object({ nombre: text('Nombre'), apellido: text('Apellido'), dni: z.string().regex(/^\d{7,8}$/, 'El DNI debe tener 7 u 8 números.'), email, usuario: username, password, cobertura: text('Obra social').default('Sin informar'), salitaId: z.string().min(1, 'Seleccioná tu salita.') }).strict();
export const salitaSchema = z.object({ nombre: text('Nombre'), direccion: text('Dirección') }).strict();
export const adminSchema = z.object({ nombre: text('Nombre'), email, usuario: username, password, salitaId: z.string().min(1, 'Seleccioná una salita.') }).strict();
export const editarAdminSchema = adminSchema.omit({ password: true });
export const restablecerAdminSchema = z.object({ nueva: password }).strict();
export const estadoAdminSchema = z.object({ bloqueado: z.boolean() }).strict();
export interface Administrador extends User { email: string; bloqueado: boolean }
export function portalFor(rol: Role) { return rol === 'superadmin' ? '/superadmin' : rol === 'admin' ? '/admin' : '/mi-portal'; }
export interface ApiResponse<T> { ok: boolean; mensaje: string; data: T; errores?: Record<string, string> }
