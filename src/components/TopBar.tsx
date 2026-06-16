import SearchDropdown from './SearchDropdown';
import { useStore } from '../store/useStore';

export default function TopBar() {
  const currentUser = useStore((state) => state.currentUser);
  const logout = useStore((state) => state.logout);
  const setSettingsOpen = useStore((state) => state.setSettingsOpen);
  const setPosterOpen = useStore((state) => state.setPosterOpen);
  const setVisitsOpen = useStore((state) => state.setVisitsOpen);
  const setAdminOpen = useStore((state) => state.setAdminOpen);

  return (
    <header className="topbar glass">
      <div className="logo">🏙️ 城市足迹</div>
      <SearchDropdown />
      <div className="topbar-actions">
        <button className="btn-outline" onClick={() => setVisitsOpen(true)}>访问明细</button>
        {currentUser?.is_admin && <button className="btn-outline" onClick={() => setAdminOpen(true)}>用户管理</button>}
        <button className="icon-btn" title="生成海报" onClick={() => setPosterOpen(true)}>↧</button>
        <button className="icon-btn" title="设置" onClick={() => setSettingsOpen(true)}>⚙</button>
      </div>
      <div className="current-user">
        <span>👤 {currentUser?.name || currentUser?.username}</span>
        <button className="btn-outline" onClick={logout}>退出</button>
      </div>
    </header>
  );
}
