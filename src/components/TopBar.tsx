import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import Icon from './Icon';

export default function TopBar() {
  const currentUser = useStore((state) => state.currentUser);
  const logout = useStore((state) => state.logout);
  const setProfileOpen = useStore((state) => state.setProfileOpen);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [menuOpen]);

  return (
    <header className="topbar glass">
      <div className="logo-group">
        <span className="logo-mark" aria-hidden="true">🗺️</span>
        <div className="logo-text-group">
          <div className="logo">城市足迹</div>
          <p className="logo-slogan">记录你走过的每一座城</p>
        </div>
      </div>
      <div className="current-user account-menu" ref={menuRef}>
        <button
          className="account-trigger"
          onClick={() => setMenuOpen((value) => !value)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          {currentUser?.name || currentUser?.username}
          <svg className={`account-trigger-arrow${menuOpen ? ' is-open' : ''}`} width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M6 8L2 4H10L6 8Z" fill="currentColor"/>
          </svg>
        </button>
        {menuOpen && (
          <div className="account-dropdown card" role="menu">
            <button
              className="account-dropdown-item"
              role="menuitem"
              onClick={() => { setMenuOpen(false); setProfileOpen(true); }}
            >
              <Icon name="user" />
              个人资料
            </button>
            <button
              className="account-dropdown-item is-danger"
              role="menuitem"
              onClick={() => { setMenuOpen(false); logout(); }}
            >
              <Icon name="logout" />
              退出登录
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
