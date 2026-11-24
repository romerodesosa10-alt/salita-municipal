import { Alert, Button, Spinner } from 'react-bootstrap';
import { Inbox, RotateCw } from 'lucide-react';
export function Loading({ label = 'Cargando registros…' }: { label?: string }) { return <div className="loading-state" role="status"><Spinner animation="border" size="sm" /><span>{label}</span></div>; }
export function Skeletons() { return <div role="status" aria-label="Cargando registros" className="skeleton-grid">{[1, 2, 3].map(i => <div className="skeleton-card" key={i}><div className="skeleton-line short" /><div className="skeleton-line" /><div className="skeleton-line" /><div className="skeleton-line medium" /></div>)}</div>; }
export function ErrorNotice({ message, retry }: { message: string; retry?: () => void }) { return <Alert variant="danger" role="alert" className="error-notice"><div>{message}</div>{retry && <Button variant="outline-danger" size="sm" onClick={retry}><RotateCw size={14} /> Reintentar</Button>}</Alert>; }
export function Empty({ title = 'Todavía no hay registros.', text = 'Agregá el primero para comenzar.' }: { title?: string; text?: string }) { return <div className="empty-state"><Inbox size={32} /><h2>{title}</h2><p>{text}</p></div>; }
