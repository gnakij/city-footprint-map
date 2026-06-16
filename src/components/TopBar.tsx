import { useState } from 'react';
import SearchDropdown from './SearchDropdown';
import { useStore } from '../store/useStore';

export default function TopBar() {
  const currentUser = useStore((s) => s.currentUser);
  const users = useStore((s) => s.users);
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const switchUser = useStore((s) => s.switchUser);
  const deleteUserAndReset = useStore((s) => s.deleteUserAndReset);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const setPosterOpen = useStore((s) => s.setPosterOpen);
  const [open, setOpen] = useState(false);

  return (
    <header className="topbar glass">
      <div className="logo">🏙️ 城市足迹</div>
      <div className="user-switcher">
        <button className="user-trigger" onClick={() => setOpen(!open)}>
          👤 {currentUser?.name || '选择用户'}
        </button>
        {open && (
          <div className="user-dropdown card">
            {users.map((u) => (
              <div key={u.id} className="user-row">
                <button className="user-name" onClick={() => { switchUser(u); setOpen(false); }}>
                  {u.name}
                </button>
                <button className="user-del" onClick={() => deleteUserAndReset(u.id)} title="删除用户">×</button>
              </div>
            ))}
            <div className="user-row" style={{ borderTop: '1px solid var(--color-outline-variant)', paddingTop: 8, marginTop: 4 }}>
              <button className="user-name" onClick={() => { setOpen(false); }} style={{ color: 'var(--color-primary)' }}>
                ✚ 新建用户
              </button>
            </div>
          </div>
        )}
      </div>
      <SearchDropdown />
      <div className="mode-pill" aria-label="记录模式">
        <button className={mode === 'duration' ? 'active' : ''} onClick={() => void setMode('duration')}>停留时长</button>
        <button className={mode === 'departure' ? 'active' : ''} onClick={() => void setMode('departure')}>最后离开</button>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="icon-btn" title="生成海报" onClick={() => setPosterOpen(true)}>↧</button>
        <button className="icon-btn" title="设置" onClick={() => setSettingsOpen(true)}>⚙</button>
      </div>
    </header>
  );
}
