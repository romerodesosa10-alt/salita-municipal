import { useState } from 'react';
import { Button } from 'react-bootstrap';
import { toast } from 'sonner';
import type { ApiResponse, EstadoMedico, Medico } from '../../shared/schemas';
import { api, errorMessage } from '../lib/api';

export default function DoctorStatus({ doctor }: { doctor: Medico }) {
  const [estado, setEstado] = useState(doctor.estado ?? 'disponible');
  const [busy, setBusy] = useState(false);
  const onLeave = estado === 'de-licencia';

  async function changeStatus() {
    setBusy(true);
    try {
      const response = await api.patch<ApiResponse<{ estado: EstadoMedico }>>(
        '/medicos/' + encodeURIComponent(doctor.id) + '/estado',
        { estado: onLeave ? 'disponible' : 'de-licencia' },
      );
      setEstado(response.data.data.estado);
      toast.success('Estado del médico actualizado.');
    } catch (cause) {
      toast.error(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return <div className="d-flex flex-wrap align-items-center gap-2 my-3">
    <span className="doctor-status-label" data-on-leave={onLeave} role="status">{onLeave ? 'De licencia' : 'Disponible'}</span>
    <Button type="button" size="sm" variant={onLeave ? 'outline-success' : 'outline-danger'} disabled={busy}
      onClick={() => void changeStatus()}>
      {busy ? 'Guardando…' : onLeave ? 'Marcar disponible' : 'Poner de licencia'}
    </Button>
  </div>;
}
