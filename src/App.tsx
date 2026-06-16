import { useEffect, useState } from 'react';
import CityDrawer from './components/CityDrawer';
import MapView from './components/MapView';
import PosterGenerator from './components/PosterGenerator';
import SettingsPanel from './components/SettingsPanel';
import StatsPanel from './components/StatsPanel';
import Toast from './components/Toast';
import TopBar from './components/TopBar';
import { useStore } from './store/useStore';

export default function App() {
  const load = useStore((state) => state.load);
  const hydrated = useStore((state) => state.hydrated);
  const currentUser = useStore((state) => state.currentUser);
  const users = useStore((state) => state.users);
  const createUserAndSwitch = useStore((state) => state.createUserAndSwitch);
  const selectedCity = useStore((state) => state.selectedCity);
  const drawerOpen = useStore((state) => state.drawerOpen);
  const settingsOpen = useStore((state) => state.settingsOpen);
  const posterOpen = useStore((state) => state.posterOpen);
  const [nameInput, setNameInput] = useState('');

  useEffect(() => { void load(); }, [load]);

  if (!hydrated) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh', fontFamily: 'Inter' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48 }}>🗺️</div>
          <p style={{ fontSize: 18, fontWeight: 700, color: '#0050CB' }}>城市足迹地图</p>
          <p style={{ color: '#727687' }}>加载中...</p>
        </div>
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh', fontFamily: 'Inter', background: '#FAF8FF' }}>
        <div style={{ textAlign: 'center', maxWidth: 360, width: '100%', padding: 32 }}>
          <div style={{ fontSize: 64 }}>🗺️</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0050CB', margin: '16px 0 8px' }}>城市足迹地图</h1>
          <p style={{ color: '#727687', marginBottom: 24 }}>欢迎！输入你的昵称开始记录足迹</p>
          <input
            className="input"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && nameInput.trim()) { createUserAndSwitch(nameInput.trim()); } }}
            placeholder="你的昵称"
            autoFocus
            style={{ marginBottom: 16, textAlign: 'center' }}
          />
          <button
            className="btn-primary"
            disabled={!nameInput.trim()}
            onClick={() => createUserAndSwitch(nameInput.trim())}
            style={{ width: '100%' }}
          >
            开始
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <TopBar />
      <main className="map-stage" id="capture-area">
        <MapView />
      </main>
      <StatsPanel />
      {drawerOpen && selectedCity && <CityDrawer city={selectedCity} />}
      {settingsOpen && <SettingsPanel />}
      {posterOpen && <PosterGenerator />}
      <Toast />
    </div>
  );
}
