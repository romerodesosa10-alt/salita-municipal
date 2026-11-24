import { useState, type FormEvent } from 'react';
import { Button, Form } from 'react-bootstrap';
import { cambiarPasswordSchema } from '../../shared/schemas.ts';
import { api, errorMessage } from '../lib/api';
import { ErrorNotice } from './Feedback';

export default function CambiarPassword() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const parsed = cambiarPasswordSchema.safeParse({ actual: values.get('actual'), nueva: values.get('nueva') });

    setError('');
    setSaved(false);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    if (parsed.data.nueva !== values.get('confirmacion')) {
      setError('Las contraseñas nuevas no coinciden.');
      return;
    }

    setBusy(true);
    try {
      await api.patch('/auth/password', parsed.data);
      form.reset();
      setSaved(true);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return <details className="form-card mt-4">
    <summary>Cambiar contraseña</summary>
    <Form className="mt-3" onSubmit={submit}>
      {error && <ErrorNotice message={error}/>}
      {saved && <p role="status">Contraseña actualizada.</p>}
      <fieldset disabled={busy}>
        <div className="form-fields">
          <Form.Group controlId="password-actual">
            <Form.Label>Contraseña actual</Form.Label>
            <Form.Control name="actual" type="password" autoComplete="current-password" required maxLength={128}/>
          </Form.Group>
          <Form.Group controlId="password-nueva">
            <Form.Label>Nueva contraseña</Form.Label>
            <Form.Control name="nueva" type="password" autoComplete="new-password" required minLength={10} maxLength={128} aria-describedby="password-minimo"/>
            <Form.Text id="password-minimo">Al menos 10 caracteres.</Form.Text>
          </Form.Group>
          <Form.Group controlId="password-confirmacion">
            <Form.Label>Repetí la nueva contraseña</Form.Label>
            <Form.Control name="confirmacion" type="password" autoComplete="new-password" required minLength={10} maxLength={128}/>
          </Form.Group>
        </div>
        <Button type="submit" className="mt-3">{busy ? 'Guardando…' : 'Guardar contraseña'}</Button>
      </fieldset>
    </Form>
  </details>;
}
