export const appointmentMinutes = 30;

export const shifts = [
  { id: 'TM', label: 'TM · Turno mañana (08:00 a 12:00)', start: 8, end: 12 },
  { id: 'TT', label: 'TT · Turno tarde (14:00 a 18:00)', start: 14, end: 18 },
];

export function appointmentDate(day: string, time: string) {
  return day && time ? day + 'T' + time + ':00-03:00' : '';
}

export function appointmentTimes(day: string, shiftId: string) {
  const shift = shifts.find(item => item.id === shiftId);
  const weekday = new Date(day + 'T12:00:00-03:00').getUTCDay();
  if (!shift || !(weekday >= 1 && weekday <= 5)) return [];

  const times: string[] = [];
  for (let minute = shift.start * 60; minute < shift.end * 60; minute += appointmentMinutes) {
    const hour = String(Math.floor(minute / 60)).padStart(2, '0');
    times.push(hour + ':' + String(minute % 60).padStart(2, '0'));
  }
  return times;
}

export function isScheduledAppointment(date: string) {
  const local = new Date(Date.parse(date) - 3 * 60 * 60 * 1000).toISOString();
  const day = local.slice(0, 10);
  const time = local.slice(11, 16);
  return local.slice(17, 23) === '00.000' && shifts.some(shift => appointmentTimes(day, shift.id).includes(time));
}
