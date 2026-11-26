import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function BackLink({ to }: { to: string }) {
  return <Link to={to} className="back-link"><ArrowLeft size={16} aria-hidden="true"/> Volver atrás</Link>;
}
