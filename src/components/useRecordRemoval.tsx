import { useState } from 'react';
import { Button, Form, Modal } from 'react-bootstrap';
import { toast } from 'sonner';
import { api, errorMessage } from '../lib/api';
import type { ApiResponse } from '../../shared/schemas.ts';
import { ErrorNotice } from './Feedback';

export default function useRecordRemoval({
  rows, path, onChange, note, disabled = false,
}: {
  rows: { id: string }[];
  path: string;
  onChange: () => void;
  note: string;
  disabled?: boolean;
}) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [pending, setPending] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const marked = rows.filter(row => checked.has(row.id)).map(row => row.id);
  const allMarked = rows.length > 0 && marked.length === rows.length;

  function clear() { setChecked(new Set()); }

  function confirm(ids: string[]) {
    setError('');
    setPending(ids);
  }

  async function remove() {
    if (busy || !pending.length) return;
    setBusy(true);
    setError('');
    try {
      const response = await api.delete<ApiResponse<unknown>>(path, { data: { ids: pending } });
      toast.success(response.data.mensaje);
      setChecked(previous => new Set([...previous].filter(id => !pending.includes(id))));
      setPending([]);
      onChange();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return {
    clear,
    checkbox: (id: string, label: string, showLabel = false) => (
      <Form.Check type="checkbox" aria-label={label} label={showLabel ? 'Seleccionar' : undefined}
        id={showLabel ? 'seleccionar-' + id : undefined} checked={checked.has(id)} disabled={busy || disabled}
        onChange={event => {
          const selected = event.target.checked;
          setChecked(previous => {
            const next = new Set(previous);
            if (selected) next.add(id);
            else next.delete(id);
            return next;
          });
        }}/>
    ),
    button: (id: string) => <Button size="sm" variant="outline-danger" disabled={busy || disabled} onClick={() => confirm([id])}>Eliminar</Button>,
    toolbar: rows.length > 0 && <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 px-4 py-3 border-bottom">
      <label className="d-flex align-items-center gap-2">
        <input className="form-check-input mt-0" type="checkbox" checked={allMarked} disabled={busy || disabled}
          ref={input => { if (input) input.indeterminate = marked.length > 0 && !allMarked; }}
          onChange={event => setChecked(event.target.checked ? new Set(rows.map(row => row.id)) : new Set())}/>
        Seleccionar todos los visibles
      </label>
      <Button size="sm" variant="outline-danger" disabled={!marked.length || busy || disabled} onClick={() => confirm(marked)}>
        Eliminar seleccionados{marked.length > 0 && ' (' + marked.length + ')'}
      </Button>
    </div>,
    dialog: pending.length > 0 && <Modal show onHide={() => { if (!busy) setPending([]); }}>
      <Modal.Header closeButton={!busy}><Modal.Title>Confirmar eliminación</Modal.Title></Modal.Header>
      <Modal.Body>
        {error && <ErrorNotice message={error}/>}
        <p>Vas a eliminar {pending.length} {pending.length === 1 ? 'registro' : 'registros'}.</p>
        <p className="mb-0">{note}</p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" disabled={busy} onClick={() => setPending([])}>Cancelar</Button>
        <Button variant="danger" disabled={busy} onClick={() => void remove()}>{busy ? 'Eliminando…' : 'Confirmar eliminación'}</Button>
      </Modal.Footer>
    </Modal>,
  };
}
