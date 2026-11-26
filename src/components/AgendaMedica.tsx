import { Button, Form } from 'react-bootstrap';
import { timeBoundaries, weekdays, type HorarioMedico } from '../../shared/agenda.ts';

export default function AgendaMedica({ slots, onChange, disabled, error }: {
  slots: HorarioMedico[];
  onChange: (slots: HorarioMedico[]) => void;
  disabled: boolean;
  error?: string;
}) {
  function update(index: number, change: Partial<HorarioMedico>) {
    onChange(slots.map((slot, position) => position === index ? { ...slot, ...change } : slot));
  }

  return <fieldset className="field-wide border rounded p-3" disabled={disabled}>
    <legend className="fs-5 mb-2">Días y horarios de atención</legend>
    <p className="muted mb-3">Agregá una franja por cada día y horario que atienda. Podés agregar dos franjas para un mismo día.</p>
    {slots.map((slot, index) => <div className="row g-2 mb-3 align-items-end" key={index}>
      <Form.Group className="col-12 col-sm" controlId={'agenda-dia-' + index}>
        <Form.Label>Día</Form.Label>
        <Form.Select value={slot.dia} onChange={event => update(index, { dia: Number(event.target.value) })}>
          {weekdays.map(({day, label}) => <option key={day} value={day}>{label}</option>)}
        </Form.Select>
      </Form.Group>
      <Form.Group className="col-6 col-sm" controlId={'agenda-desde-' + index}>
        <Form.Label>Desde</Form.Label>
        <Form.Select value={slot.desde} onChange={event => update(index, { desde: event.target.value })}>
          {timeBoundaries.map(time => <option key={time}>{time}</option>)}
        </Form.Select>
      </Form.Group>
      <Form.Group className="col-6 col-sm" controlId={'agenda-hasta-' + index}>
        <Form.Label>Hasta</Form.Label>
        <Form.Select value={slot.hasta} onChange={event => update(index, { hasta: event.target.value })}>
          {timeBoundaries.map(time => <option key={time}>{time}</option>)}
        </Form.Select>
      </Form.Group>
      <div className="col-auto"><Button type="button" variant="outline-secondary" size="sm"
        aria-label={'Quitar franja ' + (index + 1)} onClick={() => onChange(slots.filter((_, position) => position !== index))}>Quitar</Button></div>
    </div>)}
    <Button type="button" variant="outline-primary" size="sm" disabled={slots.length >= 10}
      onClick={() => onChange([...slots, { dia: 1, desde: '08:00', hasta: '12:00' }])}>Agregar día y horario</Button>
    {error && <p role="alert" className="text-danger mt-2 mb-0">{error}</p>}
  </fieldset>;
}
