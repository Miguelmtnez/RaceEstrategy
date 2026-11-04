import { Activity, ArrowUpRight, ChevronRight, CloudSun, Compass, Footprints, LogOut, MapPinned, UserRound, X } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import type { User } from '../lib/api';
import { Brand } from './Brand';

type Props = { user: User; logout: () => void; deleteAccount: () => void; open: boolean; close: () => void };
export function Sidebar({ user, logout, deleteAccount, open, close }: Props) {
  return <>
    {open && <button type="button" aria-label="Cerrar menú" className="mobile-overlay" onClick={close}/>}
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <div className="sidebar-head"><Brand/><button className="sidebar-close" onClick={close} aria-label="Cerrar menú"><X size={20}/></button></div>
      <p className="nav-heading">MI ESPACIO</p>
      <nav className="side-nav" aria-label="Navegación principal">
        <NavLink to="/dashboard" onClick={close} className={({isActive}) => `side-link ${isActive ? 'selected' : ''}`}><Activity size={20}/> Resumen <ChevronRight size={15}/></NavLink>
        <NavLink to="/actividades" onClick={close} className={({isActive}) => `side-link ${isActive ? 'selected' : ''}`}><Footprints size={20}/> Mis actividades <ChevronRight size={15}/></NavLink>
       <NavLink to="/rutas" onClick={close} className={({isActive}) => `side-link ${isActive ? 'selected' : ''}`}><Compass size={20}/> Explorar rutas <ChevronRight size={15}/></NavLink>
        <span className="side-link disabled"><MapPinned size={20}/> Mis rutas <span className="nav-soon">Pronto</span></span>
        <NavLink to="/perfil" onClick={close} className={({isActive}) => `side-link ${isActive ? 'selected' : ''}`}><UserRound size={20}/> Perfil deportivo <ChevronRight size={15}/></NavLink>
      </nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-callout"><CloudSun size={24}/><strong>Pasito a pasito</strong><p>Las mejores rutas empiezan con unas buenas ganas de salir.</p><span>¡Sigue en movimiento! <ArrowUpRight size={15}/></span></div>
      <div className="side-account"><span className="account-avatar">{user.name.slice(0,1).toUpperCase()}</span><span className="account-text"><strong>{user.name}</strong><small>{user.email}</small></span><button type="button" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={logout}><LogOut size={19}/></button></div>
      <button className="delete-account-btn" onClick={deleteAccount} type="button">Eliminar mi cuenta</button>
    </aside>
  </>;
}
