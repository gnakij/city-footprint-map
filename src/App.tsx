import { Component, type ReactNode, useEffect, useState } from 'react';
import CityDrawer from './components/CityDrawer';
import MapView from './components/MapView';
import PosterGenerator from './components/PosterGenerator';
import SettingsPanel from './components/SettingsPanel';
import StatsPanel from './components/StatsPanel';
import Toast from './components/Toast';
import TopBar from './components/TopBar';
import { useStore } from './store/useStore';

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('App render failed', error);
  }

  render() {
    if (this.state.hasError) return <WelcomeScreen />;
    return this.props.children;
  }
}

function WelcomeScreen() {
  const createUserAndSwitch = useStore((state) => state.createUserAndSwitch);
  const [nameInput, setNameInput] = useState('');

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
          onKeyDown={(e) => { if (e.key === 'Enter' && nameInput.trim()) { void createUserAndSwitch(nameInput.trim()); } }}
          placeholder="你的昵称"
          autoFocus
          style={{ marginBottom: 16, textAlign: 'center' }}
        />
        <button
          className="btn-primary"
          disabled={!nameInput.trim()}
          onClick={() => void createUserAndSwitch(nameInput.trim())}
          style={{ width: '100%' }}
        >
          开始
        </button>
      </div>
    </div>
  );
}

function AppContent() {
  const load = useStore((state) => state.load);
  const hydrated = useStore((state) => state.hydrated);
  const users = useStore((state) => state.users);
  const selectedCity = useStore((state) => state.selectedCity);
  const drawerOpen = useStore((state) => state.drawerOpen);
  const settingsOpen = useStore((state) => state.settingsOpen);
  const posterOpen = useStore((state) => state.posterOpen);

  useEffect(() => {
    let cancelled = false;
    const fallback = window.setTimeout(() => {
      if (!cancelled && !useStore.getState().hydrated) {
        useStore.setState({ users: [], currentUser: null, hydrated: true, toast: { icon: '!', message: '数据加载超时，请刷新重试' } });
      }
    }, 5000);

    void load().finally(() => window.clearTimeout(fallback));

    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
    };
  }, [load]);

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
    return <WelcomeScreen />;
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

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
