import { useState, useRef, type FormEvent } from 'react';
import { Button, Form } from 'react-bootstrap';
import { Check } from 'lucide-react';
import { adminSchema, opcionesCobertura, registroSchema, salitaSchema, type Salita } from '../../shared/schemas.ts';
import { serverErrors, errorMessage } from '../lib/api';
import { ErrorNotice } from './Feedback';
type Mode = 'registro' | 'admin' | 'salita';
const configs = {
  registro: { schema: registroSchema, fields: ['nombre', 'apellido', 'dni', 'cobertura', 'email', 'usuario', 'password', 'salitaId'], action: 'Crear mi cuenta' },
  admin: { schema: adminSchema, fields: ['nombre', 'email', 'usuario', 'password', 'salitaId'], action: 'Crear administrador' },
  salita: { schema: salitaSchema, fields: ['nombre', 'direccion'], action: 'Crear salita' },
};
const labels: Record<string, string> = { nombre: 'Nombre', apellido: 'Apellido', dni: 'DNI', cobertura: '¿Tiene obra social?', email: 'Email', usuario: 'Usuario', password: 'Contraseña', salitaId: 'Salita', direccion: 'Dirección' };
export default function AccountForm({ mode, salitas = [], submit }: { mode: Mode; salitas?: Salita[]; submit: (data: Record<string, string>) => Promise<void> }) {
  const config = configs[mode]; const formRef = useRef<HTMLFormElement>(null); const lock = useRef(false);
  const [values, setValues] = useState<Record<string, string>>({}); const [errors, setErrors] = useState<Record<string, string>>({}); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function handle(event: FormEvent) {
    event.preventDefault(); if (lock.current) return; setError('');
    const payload = Object.fromEntries(config.fields.map(key => [key, values[key] || ''])); const parsed = config.schema.safeParse(payload);
    if (!parsed.success) { const next: Record<string, string> = {}; for (const issue of parsed.error.issues) next[issue.path.join('.')] ??= issue.message; setErrors(next); requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); return; }
    if (mode === 'registro' && values.confirmacion !== values.password) { setErrors({ confirmacion: 'Las contraseñas no coinciden.' }); return; }
    setErrors({}); setBusy(true); lock.current = true;
    try { await submit(parsed.data); setValues({}); } catch (error) { setError(errorMessage(error)); setErrors(serverErrors(error)); } finally { lock.current = false; setBusy(false); }
  }
  return <Form noValidate onSubmit={handle} ref={formRef}>{error && <ErrorNotice message={error}/>}<div className="form-fields">{[...config.fields, ...(mode === 'registro' ? ['confirmacion'] : [])].map(key => {
    const props = { id: `${mode}-${key}`, name: key, value: values[key] || '', onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => { setValues(v => ({ ...v, [key]: e.target.value })); setErrors(v => ({ ...v, [key]: '' })); }, disabled: busy, isInvalid: !!errors[key], 'aria-invalid': !!errors[key], 'aria-describedby': `${mode}-${key}-help` };
    return <Form.Group key={key} className={['salitaId', 'direccion'].includes(key) ? 'field-wide' : ''}><Form.Label htmlFor={props.id}>{key === 'confirmacion' ? 'Repetir contraseña' : labels[key]}</Form.Label>{key === 'salitaId' ? <Form.Select {...props}><option value="">Seleccioná una salita</option>{salitas.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Form.Select> : key === 'cobertura' ? <Form.Select {...props} required><option value="">Seleccioná Sí o No</option>{opcionesCobertura.map(nombre => <option key={nombre}>{nombre}</option>)}</Form.Select> : <Form.Control {...props} required type={['password', 'confirmacion'].includes(key) ? 'password' : key === 'email' ? 'email' : 'text'} autoComplete={['password', 'confirmacion'].includes(key) ? 'new-password' : key === 'usuario' ? 'username' : key === 'email' ? 'email' : 'off'} maxLength={['password', 'confirmacion'].includes(key) ? 128 : 150} placeholder={key === 'password' ? 'Al menos 10 caracteres' : undefined}/>}<Form.Control.Feedback id={`${mode}-${key}-help`} type="invalid">{errors[key]}</Form.Control.Feedback></Form.Group>;
  })}</div><Button type="submit" disabled={busy || (mode !== 'salita' && !salitas.length)} className="mt-4"><Check size={17}/>{busy ? 'Guardando…' : config.action}</Button></Form>;
}

