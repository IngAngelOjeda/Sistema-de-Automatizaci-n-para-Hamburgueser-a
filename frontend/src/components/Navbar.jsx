import { NavLink } from 'react-router-dom';

export default function Navbar() {
  return (
    <nav className="bg-orange-600 text-white shadow-md">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-6">
        <span className="font-bold text-lg">🍔 Burger Casa</span>
        <NavLink
          to="/admin"
          className={({ isActive }) =>
            `px-4 py-2 rounded-lg font-medium transition ${
              isActive ? 'bg-white text-orange-600' : 'hover:bg-orange-500'
            }`
          }
        >
          ⚙️ Admin
        </NavLink>
      </div>
    </nav>
  );
}
