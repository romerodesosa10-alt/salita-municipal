import { useEffect, useState } from 'react';
import { Alert } from 'react-bootstrap';
import { useAuth } from '../auth/AuthContext';

export function useBookingCountdown() {
  const { user } = useAuth();
  const until = Date.parse(user?.turnosBloqueadosHasta ?? '');
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!(until > Date.now())) return;
    const update = () => {
      const current = Date.now();
      setNow(current);
      if (current >= until) window.clearInterval(timer);
    };
    const timer = window.setInterval(update, 1000);
    update();
    return () => window.clearInterval(timer);
  }, [until]);
  return until > now ? Math.ceil((until - now) / 1000) : 0;
}

export function BookingCountdown({ seconds }: { seconds: number }) {
  const countdown = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(part => String(part).padStart(2, '0')).join(':');
  return <Alert variant="warning">
    <strong>Podés solicitar otro turno en <span role="timer">{countdown}</span>.</strong>
    <div>Después de cancelar un turno, tenés que esperar 24 horas para solicitar otro.</div>
  </Alert>;
}
