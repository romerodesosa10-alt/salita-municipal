import { Button } from 'react-bootstrap';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addCalendarDays, localAppointmentDay, type AppointmentAvailability } from '../../shared/agenda';

const weekday = new Intl.DateTimeFormat('es-AR', {weekday: 'short', timeZone: 'UTC'});
const dateLabel = new Intl.DateTimeFormat('es-AR', {day: 'numeric', month: 'short', timeZone: 'UTC'});
const dateFor = (day: string) => new Date(day + 'T12:00:00Z');

export default function AvailabilityCalendar({
  week, setWeek, days, day, pickDay, time, pickTime, busy, error,
}: {
  week: string;
  setWeek: (day: string) => void;
  days: AppointmentAvailability[];
  day: string;
  pickDay: (day: string) => void;
  time: string;
  pickTime: (time: string) => void;
  busy: boolean;
  error?: string;
}) {
  const selected = days.find(entry => entry.day === day);
  const remaining = selected?.slots.filter(slot => slot.available).length ?? 0;

  return <div className="availability-calendar">
    <div className="d-flex align-items-center justify-content-between gap-2 mb-3">
      <Button type="button" variant="outline-secondary" size="sm" aria-label="Semana anterior"
        disabled={busy || week <= localAppointmentDay()}
        onClick={() => setWeek(addCalendarDays(week, -7))}><ChevronLeft size={18}/></Button>
      <strong>{dateLabel.format(dateFor(week))} al {dateLabel.format(dateFor(addCalendarDays(week, 6)))}</strong>
      <Button type="button" variant="outline-secondary" size="sm" aria-label="Semana siguiente"
        disabled={busy} onClick={() => setWeek(addCalendarDays(week, 7))}><ChevronRight size={18}/></Button>
    </div>
    <div className="availability-days" aria-label="Fechas de atención">
      {Array.from({length: 7}, (_, index) => {
        const date = addCalendarDays(week, index);
        const entry = days.find(item => item.day === date);
        const count = entry?.slots.filter(slot => slot.available).length ?? 0;
        const state = count ? 'free' : entry?.slots.length ? 'full' : 'closed';
        return <button key={date} data-date={date} type="button" className="availability-option" data-state={state}
          aria-pressed={day === date} disabled={busy || count === 0} onClick={() => pickDay(date)}>
          <strong>{weekday.format(dateFor(date))} {dateFor(date).getUTCDate()}</strong>
          <small>{count ? count + (count === 1 ? ' cupo' : ' cupos') : state === 'full' ? 'Ocupado' : entry ? 'Sin horarios' : '—'}</small>
        </button>;
      })}
    </div>
    {selected && <div className="mt-3">
      <p className="mb-2" role="status"><strong>{remaining === 0 ? 'No quedan turnos disponibles' :
        remaining === 1 ? 'Queda 1 turno disponible' : 'Quedan ' + remaining + ' turnos disponibles'}</strong></p>
      <div className="availability-times" aria-label="Horarios de atención">
        {selected.slots.map(slot => <button key={slot.time} type="button" className="availability-option"
          data-state={slot.available ? 'free' : 'full'} aria-pressed={time === slot.time && slot.available}
          disabled={busy || !slot.available} onClick={() => pickTime(slot.time)}>
          <strong>{slot.time}</strong><small>{slot.available ? 'Disponible' : 'Ocupado'}</small>
        </button>)}
      </div>
    </div>}
    {error && <p className="mt-2 mb-0 text-danger" role="alert">{error}</p>}
  </div>;
}
