import { useState } from 'react';
import { Button } from 'react-bootstrap';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { estadoTurnoLabels, type ITurno } from '../../shared/schemas';

export default function AppointmentReceipt({ turno }: { turno: ITurno }) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
      const pdf = await PDFDocument.create();
      pdf.setTitle('Comprobante de turno | Salita Municipal');
      const page = pdf.addPage([595, 540]);
      const title = await pdf.embedFont(StandardFonts.HelveticaBold);
      const body = await pdf.embedFont(StandardFonts.Helvetica);
      const clean = (text: string) => Array.from(text.replace(/\s+/g, ' ')).map(char => {
        try { body.encodeText(char); return char; } catch { return '?'; }
      }).join('');
      page.drawRectangle({ x: 0, y: 419, width: 595, height: 121, color: rgb(.02, .31, .25) });
      page.drawText('SALITA MUNICIPAL', { x: 40, y: 495, size: 12, font: title, color: rgb(.72, .93, .85) });
      page.drawText('Comprobante de turno', { x: 40, y: 451, size: 30, font: title, color: rgb(1, 1, 1) });
      const date = new Date(turno.fechaTurno).toLocaleString('es-AR', {
        dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires',
      });
      const fields = [
        ['Paciente', turno.paciente ? turno.paciente.nombre + ' ' + turno.paciente.apellido : 'Sin asignar'],
        ['Fecha y hora', date],
        ['Profesional', turno.medico ? turno.medico.nombre + ' ' + turno.medico.apellido : 'Sin asignar'],
        ['Salita', turno.salitaNombre || 'Sin informar'],
        ['Consultorio', turno.consultorio?.nombre || 'Sin asignar'],
        ['Estado', estadoTurnoLabels[turno.estado]],
      ];
      fields.forEach(([label, value], index) => {
        const y = 386 - index * 52;
        page.drawText(label.toUpperCase(), { x: 40, y, font: title, size: 10, color: rgb(.05, .38, .31) });
        page.drawText(clean(value), { x: 40, y: y - 19, font: body, size: 13, maxWidth: 515, lineHeight: 14 });
      });
      page.drawText(clean('Referencia: ' + turno.id), { x: 40, y: 35, font: body, size: 10, maxWidth: 515 });
      const bytes = await pdf.save();
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'Comprobante-turno-' + turno.id + '.pdf';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error('No se pudo descargar el comprobante. Volvé a intentarlo.');
    } finally {
      setBusy(false);
    }
  }

  return <Button type="button" variant="outline-primary" disabled={busy} onClick={() => void download()}>
    <Download size={16} aria-hidden="true"/> {busy ? 'Preparando PDF…' : 'Descargar comprobante'}
  </Button>;
}
