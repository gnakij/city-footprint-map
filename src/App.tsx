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
  const selectedCity = useStore((state) => state.selectedCity);
  const drawerOpen = useStore((state) => state.drawerOpen);
  const settingsOpen = useStore((state) => state.settingsOpen);
  const posterOpen = useStore((state) => state.posterOpen);

  useEffect(() => {
    void load();
  }, [load]);

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
