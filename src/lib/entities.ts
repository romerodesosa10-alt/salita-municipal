import { CalendarDays, DoorOpen, Stethoscope, Users } from 'lucide-react';
import type { Entity } from '../../shared/schemas.ts';
export const entities = {
  pacientes: { title: 'Pacientes', singular: 'paciente', description: 'Las personas que confían en nuestra atención.', icon: Users, color: 'blue' },
  medicos: { title: 'Médicos', singular: 'médico', description: 'El equipo que hace posible cada atención.', icon: Stethoscope, color: 'purple' },
  consultorios: { title: 'Consultorios', singular: 'consultorio', description: 'Espacios preparados para recibir a cada paciente.', icon: DoorOpen, color: 'orange' },
  turnos: { title: 'Turnos', singular: 'turno', description: 'Cada encuentro, organizado en un solo lugar.', icon: CalendarDays, color: 'teal' },
} satisfies Record<Entity, object>;
