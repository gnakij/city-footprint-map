import SearchDropdown from './SearchDropdown';
import { useStore } from '../store/useStore';

export default function TopBar() {
  const mode = useStore((state) => state.mode);
  const setMode = useStore((state) => state.setMode);
  const setSettingsOpen = useStore((state) => state.setSettingsOpen);
  const setPosterOpen = useStore((state) => state.setPosterOpen);

  return (
    <header className="topbar glass">
      <div className="logo">🏙️ 城市足迹</div>
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
