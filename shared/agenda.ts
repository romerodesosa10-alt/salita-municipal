export const appointmentMinutes = 30;

export const shifts = [
  { id: 'TM', label: 'TM · Turno mañana (08:00 a 12:00)', start: 8, end: 12 },
  { id: 'TT', label: 'TT · Turno tarde (14:00 a 18:00)', start: 14, end: 18 },
];

export const weekdays = [
  { day: 1, label: 'Lunes' }, { day: 2, label: 'Martes' }, { day: 3, label: 'Miércoles' },
  { day: 4, label: 'Jueves' }, { day: 5, label: 'Viernes' },
];

export type HorarioMedico = { dia: number; desde: string; hasta: string };

export function timeLabel(minute: number) {
  return String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0');
}

export const timeBoundaries = shifts.flatMap(shift =>
  Array.from({ length: (shift.end - shift.start) * 2 + 1 }, (_, index) => timeLabel(shift.start * 60 + index * appointmentMinutes)),
);

export function validScheduleRange(desde: string, hasta: string) {
  return timeBoundaries.includes(desde) && timeBoundaries.includes(hasta) && desde < hasta &&
    shifts.some(shift => desde >= timeLabel(shift.start * 60) && hasta <= timeLabel(shift.end * 60));
}

export function appointmentDate(day: string, time: string) {
  return day && time ? day + 'T' + time + ':00-03:00' : '';
}

export function appointmentTimes(day: string, shiftId: string, agenda?: HorarioMedico[]) {
  const shift = shifts.find(item => item.id === shiftId);
  const weekday = new Date(day + 'T12:00:00-03:00').getUTCDay();
  if (!shift || !(weekday >= 1 && weekday <= 5)) return [];

  const times: string[] = [];
  for (let minute = shift.start * 60; minute < shift.end * 60; minute += appointmentMinutes) {
    const time = timeLabel(minute);
    if (!agenda || agenda.some(slot => slot.dia === weekday && time >= slot.desde && timeLabel(minute + appointmentMinutes) <= slot.hasta)) {
      times.push(time);
    }
  }
  return times;
}

export function isScheduledAppointment(date: string, agenda?: HorarioMedico[]) {
  const local = new Date(Date.parse(date) - 3 * 60 * 60 * 1000).toISOString();
  const day = local.slice(0, 10);
  const time = local.slice(11, 16);
  return local.slice(17, 23) === '00.000' && shifts.some(shift => appointmentTimes(day, shift.id, agenda).includes(time));
}
