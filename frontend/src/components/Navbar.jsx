import { NavLink } from 'react-router-dom';
import logo from '../../img/8646d5f33597831d.jpg';

export default function Navbar() {
  return (
    <nav className="bg-black border-b border-brand-border sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <img src={logo} alt="Logo" className="w-9 h-9 rounded-md object-cover flex-shrink-0" />
          <span className="font-display text-brand-yellow text-2xl tracking-wide leading-none truncate">
            LOMI LIZ ACAHAY
          </span>
        </div>
        <NavLink
          to="/admin"
          className={({ isActive }) =>
            `ml-4 px-4 py-1.5 rounded text-sm font-semibold transition-colors flex-shrink-0 ${
              isActive
                ? 'bg-brand-yellow text-black'
                : 'text-brand-muted border border-brand-border hover:text-brand-yellow hover:border-brand-yellow'
            }`
          }
        >
          Admin
        </NavLink>
      </div>
    </nav>
  );
}
