import { useEffect } from 'react';
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
  const selectedCity = useStore((state) => state.selectedCity);
  const drawerOpen = useStore((state) => state.drawerOpen);
  const settingsOpen = useStore((state) => state.settingsOpen);
  const posterOpen = useStore((state) => state.posterOpen);

  useEffect(() => {
    void load();
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
