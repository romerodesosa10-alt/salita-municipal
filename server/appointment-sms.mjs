const localDate = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short', hourCycle: 'h23',
});

export async function notifyAppointmentSms(patient, appointment, send = fetch) {
  const { TWILIO_ACCOUNT_SID: account, TWILIO_AUTH_TOKEN: token, TWILIO_MESSAGING_SERVICE_SID: service } = process.env;
  const area = patient?.telefono?.codigoArea?.replace(/^0/, '') ?? '';
  const stored = patient?.telefono?.numero ?? '';
  const local = area + (area.length + stored.length === 12 ? stored.replace(/^15/, '') : stored);
  const to = patient?.celularSms || (/^\d{10}$/.test(local) ? '+549' + local : '');
  if (!/^\+[1-9]\d{7,14}$/.test(to)) return 'sin-telefono';
  if (!account || !token || !service) return 'sin-configurar';

  try {
    const response = await send('https://api.twilio.com/2010-04-01/Accounts/' + encodeURIComponent(account) + '/Messages.json', {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(account + ':' + token).toString('base64') },
      body: new URLSearchParams({
        To: to,
        MessagingServiceSid: service,
        Body: 'Salita Municipal: tenés un turno el ' + localDate.format(new Date(appointment.fechaTurno)) +
          '. Consultá la sede y el comprobante en tu portal: https://salita-municipal.vercel.app/',
      }),
      signal: AbortSignal.timeout(4500),
    });
    if (!response.ok) return 'fallido';
    const result = await response.json();
    return result.sid && !['failed', 'undelivered', 'canceled'].includes(result.status) ? 'en-cola' : 'fallido';
  } catch {
    return 'fallido';
  }
}
