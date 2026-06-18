import { useStore } from '../store/useStore';

export default function TopBar() {
  const currentUser = useStore((state) => state.currentUser);
  const logout = useStore((state) => state.logout);
  const setProfileOpen = useStore((state) => state.setProfileOpen);

  return (
    <header className="topbar glass">
      <div className="logo">城市足迹</div>
      <div className="current-user">
        <span className="user-trigger" onClick={() => setProfileOpen(true)} style={{ cursor: 'pointer' }}>
          {currentUser?.name || currentUser?.username}
        </span>
        <button className="btn-outline small" onClick={logout}>退出</button>
      </div>
    </header>
  );
}
