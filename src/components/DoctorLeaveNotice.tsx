import { Alert } from 'react-bootstrap';
import type { ITurno } from '../../shared/schemas';

export default function DoctorLeaveNotice({ turno }: { turno: ITurno }) {
  if (turno.medico?.estado !== 'de-licencia' || turno.estado !== 'pendiente' ||
      Date.parse(turno.fechaTurno) <= Date.now()) return null;

  return <Alert variant="danger" className="mt-3 mb-0">
    <strong>Profesional de licencia</strong>
    <div>El turno sigue registrado. Consultá con la salita para confirmar la atención o coordinar otro horario.</div>
  </Alert>;
}
