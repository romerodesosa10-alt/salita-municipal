import { useState, type FormEvent } from 'react';
import { Button, Form, Modal } from 'react-bootstrap';
import { cancelarTurnoSchema, type ApiResponse } from '../../shared/schemas.ts';
import { useAuth } from '../auth/AuthContext';
import { api, errorMessage } from '../lib/api';
import { ErrorNotice } from './Feedback';

export default function CancelTurno({ id, onCancelled }: { id: string; onCancelled: () => void }) {
  const { updateBookingBlock } = useAuth();
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const parsed = cancelarTurnoSchema.safeParse({ motivo });
    if (!parsed.success) {
      setError('Ingresá un motivo de hasta 300 caracteres.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await api.patch<ApiResponse<{ bloqueadoHasta: string }>>(
        '/turnos/' + encodeURIComponent(id) + '/cancelar', parsed.data,
      );
      updateBookingBlock(response.data.data.bloqueadoHasta);
      setOpen(false);
      onCancelled();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return <>
    <Button type="button" variant="outline-danger" onClick={() => { setMotivo(''); setError(''); setOpen(true); }}>
      Cancelar turno
    </Button>
    {open && <Modal show onHide={() => { if (!busy) setOpen(false); }} aria-labelledby={'cancelar-turno-' + id}>
      <Form onSubmit={confirm}>
        <Modal.Header closeButton={!busy}><Modal.Title id={'cancelar-turno-' + id}>Cancelar turno</Modal.Title></Modal.Header>
        <Modal.Body>
          {error && <ErrorNotice message={error}/>}
          <p>Si cancelás, tendrás que esperar 24 horas para solicitar otro turno.</p>
          <Form.Group controlId={'motivo-' + id}>
            <Form.Label>Motivo de la cancelación</Form.Label>
            <Form.Control as="textarea" rows={3} maxLength={300} required autoFocus
              disabled={busy} value={motivo} onChange={event => setMotivo(event.target.value)}/>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" variant="outline-secondary" disabled={busy} onClick={() => setOpen(false)}>Conservar turno</Button>
          <Button type="submit" variant="danger" disabled={busy}>{busy ? 'Cancelando…' : 'Confirmar cancelación'}</Button>
        </Modal.Footer>
      </Form>
    </Modal>}
  </>;
}
