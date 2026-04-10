/**
 * Iconos de acción para tablas: Editar (lápiz) y Eliminar (papelera).
 * Uso en listados CRUD del Trading BOT.
 */
import { Button } from 'react-bootstrap';

const PENCIL_SVG = (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    <path d="m15 5 4 4" />
  </svg>
);

const TRASH_SVG = (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    <line x1="10" x2="10" y1="11" y2="17" />
    <line x1="14" x2="14" y1="11" y2="17" />
  </svg>
);

interface TableActionIconsProps {
  onEdit: () => void;
  onDelete?: () => void;
  editTitle?: string;
  deleteTitle?: string;
}

export function TableActionIcons({ onEdit, onDelete, editTitle = 'Editar', deleteTitle = 'Eliminar' }: TableActionIconsProps) {
  return (
    <span className="d-inline-flex align-items-center gap-1">
      <Button
        variant="link"
        size="sm"
        className="p-0 text-info text-decoration-none"
        onClick={onEdit}
        title={editTitle}
        aria-label={editTitle}
      >
        {PENCIL_SVG}
      </Button>
      {onDelete != null && (
        <Button
          variant="link"
          size="sm"
          className="p-0 text-danger text-decoration-none"
          onClick={onDelete}
          title={deleteTitle}
          aria-label={deleteTitle}
        >
          {TRASH_SVG}
        </Button>
      )}
    </span>
  );
}
