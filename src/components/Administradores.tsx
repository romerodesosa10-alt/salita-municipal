import { useState, type FormEvent } from 'react';
import { Badge, Button, Form, Modal } from 'react-bootstrap';
import { toast } from 'sonner';
import { editarAdminSchema, restablecerAdminSchema, type Administrador, type ApiResponse, type Salita } from '../../shared/schemas.ts';
import { api, errorMessage } from '../lib/api';
import { ErrorNotice } from './Feedback';

type Action = 'editar' | 'estado' | 'eliminar' | 'password';
type Selection = { action: Action; user: Administrador };

export default function Administradores({ users, salitas, onChange }: {
  users: Administrador[];
  salitas: Salita[];
  onChange: () => void;
}) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function open(action: Action, user: Administrador) {
    setError('');
    setSelection({ action, user });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selection || busy) return;

    const { action, user } = selection;
    const path = '/superadmin/administradores/' + encodeURIComponent(user.id);
    setError('');
    const form = new FormData(event.currentTarget);
    let payload: unknown = { bloqueado: !user.bloqueado };
    if (action === 'editar' || action === 'password') {
      const changes = action === 'editar'
        ? editarAdminSchema.safeParse(Object.fromEntries(form))
        : restablecerAdminSchema.safeParse({ nueva: form.get('nueva') });
      if (!changes.success) {
        setError(changes.error.issues[0].message);
        return;
      }
      if (action === 'password' && form.get('nueva') !== form.get('confirmacion')) {
        setError('Las contraseñas no coinciden.');
        return;
      }
      payload = changes.data;
    }

    setBusy(true);
    try {
      const response = action === 'eliminar'
        ? await api.delete<ApiResponse<unknown>>(path)
        : await api.patch<ApiResponse<unknown>>(path, payload);
      toast.success(response.data.mensaje);
      setSelection(null);
      onChange();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  const user = selection?.user;
  const title = selection?.action === 'editar' ? 'Editar administrador'
    : selection?.action === 'password' ? 'Restablecer contraseña'
    : selection?.action === 'eliminar' ? 'Eliminar administrador'
    : user?.bloqueado ? 'Desbloquear administrador' : 'Bloquear administrador';

  return <>
    {users.length === 0 ? <p className="muted">Todavía no hay administradores registrados.</p> :
      <div className="table-responsive">
        <table className="agenda-table administrators-table">
          <thead><tr><th>Nombre</th><th>Usuario</th><th>Salita asignada</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>{users.map(admin => <tr key={admin.id}>
            <td>{admin.nombre}</td><td>{admin.usuario}</td><td>{admin.salitaNombre}</td>
            <td><Badge bg={admin.bloqueado ? 'secondary' : 'success'}>{admin.bloqueado ? 'Bloqueado' : 'Activo'}</Badge></td>
            <td><div className="d-flex flex-wrap gap-2">
              <Button size="sm" variant="outline-secondary" onClick={() => open('editar', admin)}>Editar</Button>
              <Button size="sm" variant={admin.bloqueado ? 'outline-success' : 'outline-warning'} onClick={() => open('estado', admin)}>{admin.bloqueado ? 'Desbloquear' : 'Bloquear'}</Button>
              <Button size="sm" variant="outline-secondary" onClick={() => open('password', admin)}>Restablecer contraseña</Button>
              <Button size="sm" variant="outline-danger" onClick={() => open('eliminar', admin)}>Eliminar</Button>
            </div></td>
          </tr>)}</tbody>
        </table>
      </div>}

    {selection && user && <Modal show onHide={() => { if (!busy) setSelection(null); }} aria-labelledby="admin-action-title">
      <Form onSubmit={submit}>
        <Modal.Header closeButton={!busy}>
          <Modal.Title id="admin-action-title">{title}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <ErrorNotice message={error}/>}
          {selection.action === 'editar' ? <fieldset disabled={busy} className="form-fields">
            <Form.Group controlId="edit-admin-nombre"><Form.Label>Nombre</Form.Label><Form.Control name="nombre" defaultValue={user.nombre} required maxLength={120}/></Form.Group>
            <Form.Group controlId="edit-admin-usuario"><Form.Label>Usuario</Form.Label><Form.Control name="usuario" defaultValue={user.usuario} required maxLength={40}/></Form.Group>
            <Form.Group controlId="edit-admin-email"><Form.Label>Correo electrónico</Form.Label><Form.Control name="email" type="email" defaultValue={user.email} required maxLength={150}/></Form.Group>
            <Form.Group controlId="edit-admin-salita"><Form.Label>Salita</Form.Label><Form.Select name="salitaId" required defaultValue={user.salitaId || ''}>
              <option value="">Elegí una salita</option>
              {salitas.map(site => <option key={site.id} value={site.id}>{site.nombre}</option>)}
            </Form.Select></Form.Group>
          </fieldset> : selection.action === 'password' ? <fieldset disabled={busy}>
            <p>Vas a cambiar la contraseña de <strong>{user.usuario}</strong> y cerrar sus sesiones abiertas.</p>
            <Form.Group className="mb-3" controlId="reset-admin-password">
              <Form.Label>Nueva contraseña</Form.Label>
              <Form.Control name="nueva" type="password" autoComplete="new-password" required minLength={10} maxLength={128}/>
              <Form.Text>Usá al menos 10 caracteres.</Form.Text>
            </Form.Group>
            <Form.Group controlId="reset-admin-confirmacion">
              <Form.Label>Repetí la nueva contraseña</Form.Label>
              <Form.Control name="confirmacion" type="password" autoComplete="new-password" required minLength={10} maxLength={128}/>
            </Form.Group>
          </fieldset> : <p className="mb-0">{selection.action === 'eliminar'
            ? `Se eliminará la cuenta de ${user.usuario}. Los datos de la salita se conservan.`
            : user.bloqueado ? `${user.usuario} podrá volver a iniciar sesión.`
            : `Se cerrarán las sesiones de ${user.usuario} y su acceso quedará bloqueado hasta que lo desbloquees.`}</p>}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" disabled={busy} onClick={() => setSelection(null)}>Cancelar</Button>
          <Button type="submit" variant={selection.action === 'eliminar' ? 'danger' : 'primary'} disabled={busy || (selection.action === 'editar' && !salitas.length)}>
            {busy ? 'Guardando…' : selection.action === 'editar' ? 'Guardar cambios' : title}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>}
  </>;
}
