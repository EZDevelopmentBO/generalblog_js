import { useState, type ReactNode } from 'react';

interface ResponsiveNavbarProps {
  brand: ReactNode;
  children: ReactNode;
  /** Optional extra class for the nav element */
  className?: string;
}

/**
 * Navbar que en móvil muestra un botón hamburguesa y colapsa los enlaces.
 * En pantallas lg y mayores los enlaces se muestran inline.
 */
export function ResponsiveNavbar({ brand, children, className = '' }: ResponsiveNavbarProps) {
  const [open, setOpen] = useState(false);
  const navId = 'navbar-collapse';

  return (
    <nav
      className={`navbar navbar-expand-lg navbar-dark bg-dark border-bottom border-secondary ${className}`.trim()}
      aria-label="Navegación principal"
    >
      <div className="container">
        {brand}
        <button
          type="button"
          className="navbar-toggler"
          aria-controls={navId}
          aria-expanded={open}
          aria-label="Abrir menú"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="navbar-toggler-icon" />
        </button>
        <div
          id={navId}
          className={`collapse navbar-collapse ${open ? 'show' : ''}`}
        >
          <div className="d-flex flex-column flex-lg-row align-items-lg-center gap-2 mt-2 mt-lg-0 ms-lg-auto">
            {children}
          </div>
        </div>
      </div>
    </nav>
  );
}
