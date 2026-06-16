import { Component, type ReactNode, useEffect } from 'react';
import AdminPanel from './components/AdminPanel';
import CityDrawer from './components/CityDrawer';
import DrillDownStats from './components/DrillDownStats';
import LoginPage from './components/LoginPage';
import MapView from './components/MapView';
import PosterGenerator from './components/PosterGenerator';
import SettingsPanel from './components/SettingsPanel';
import StatsPanel from './components/StatsPanel';
import Toast from './components/Toast';
import TopBar from './components/TopBar';
import VisitList from './components/VisitList';
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
    if (this.state.hasError) return <div className="empty-state">应用渲染失败，请刷新重试。</div>;
    return this.props.children;
  }
}

function Loading() {
  return (
    <div className="login-page">
      <div className="login-card card">
        <div className="brand-mark">城</div>
        <h1>城市足迹地图</h1>
        <p>加载中...</p>
      </div>
    </div>
  );
}

function AppContent() {
  const load = useStore((state) => state.load);
  const hydrated = useStore((state) => state.hydrated);
  const currentUser = useStore((state) => state.currentUser);
  const selectedCity = useStore((state) => state.selectedCity);
  const drawerOpen = useStore((state) => state.drawerOpen);
  const settingsOpen = useStore((state) => state.settingsOpen);
  const posterOpen = useStore((state) => state.posterOpen);
  const visitsOpen = useStore((state) => state.visitsOpen);
  const adminOpen = useStore((state) => state.adminOpen);
  const statsOpen = useStore((state) => state.statsOpen);

  useEffect(() => {
    void load();
  }, [load]);

  if (!hydrated) return <Loading />;

  if (!currentUser) {
    return (
      <>
        <LoginPage />
        <Toast />
      </>
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
      {visitsOpen && <VisitList />}
      {statsOpen && <DrillDownStats />}
      {adminOpen && currentUser.is_admin && <AdminPanel />}
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
