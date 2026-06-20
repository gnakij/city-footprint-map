import { useStore } from '../store/useStore';

export default function TopBar() {
  const currentUser = useStore((state) => state.currentUser);
  const logout = useStore((state) => state.logout);
  const setProfileOpen = useStore((state) => state.setProfileOpen);

  return (
    <header className="topbar glass">
      <div className="logo-group">
        <span className="logo-mark" aria-hidden="true">🗺️</span>
        <div className="logo-text-group">
          <div className="logo">城市足迹</div>
          <p className="logo-slogan">记录你走过的每一座城</p>
        </div>
      </div>
      <div className="current-user">
        <span className="user-trigger" onClick={() => setProfileOpen(true)} style={{ cursor: 'pointer' }}>
          {currentUser?.name || currentUser?.username}
        </span>
        <button className="btn-outline small" onClick={logout}>退出</button>
      </div>
    </header>
  );
}
