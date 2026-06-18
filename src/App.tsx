import { Component, type ReactNode, lazy, Suspense, useEffect } from 'react';
import LoginPage from './components/LoginPage';
import StatsPanel from './components/StatsPanel';
import Toast from './components/Toast';
import TopBar from './components/TopBar';
import { useStore } from './store/useStore';

// 地图相关组件延迟加载（含 ECharts ~1MB，首屏不需要）
const MapView = lazy(() => import('./components/MapView'));
const CityDrawer = lazy(() => import('./components/CityDrawer'));
const UserProfile = lazy(() => import('./components/UserProfile'));

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: unknown) { console.error('App render failed', error); }
  render() {
    if (this.state.hasError) return <div className="empty-state">应用渲染失败，请刷新重试。</div>;
    return this.props.children;
  }
}

function Loading() {
  return (
    <div className="login-page">
      <div className="login-panel glass">
        <div className="login-header">
          <div className="brand-mark">🗺️</div>
          <h1>城市足迹</h1>
          <p>记录你走过的每一座城</p>
        </div>
      </div>
    </div>
  );
}

function MapFallback() {
  return (
    <div className="china-map" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, color: 'var(--color-on-surface-variant)' }}>
      <div className="brand-mark" style={{ fontSize: 40, opacity: 0.6 }}>🗺️</div>
      <div style={{ fontSize: 16, fontWeight: 700 }}>地图加载中…</div>
      <div style={{ fontSize: 13, opacity: 0.6 }}>首次加载约需几秒，请耐心等待</div>
    </div>
  );
}

function AppContent() {
  const load = useStore((state) => state.load);
  const hydrated = useStore((state) => state.hydrated);
  const currentUser = useStore((state) => state.currentUser);
  const selectedCity = useStore((state) => state.selectedCity);
  const drawerOpen = useStore((state) => state.drawerOpen);
  const profileOpen = useStore((state) => state.profileOpen);

  useEffect(() => {
    void load();
  }, [load]);

  // 应用加载完后就预取地图组件，不等到登录后
  useEffect(() => {
    if (hydrated) {
      // 后台静默预加载 ECharts 地图 chunk
      import('./components/MapView');
    }
  }, [hydrated]);

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
        <Suspense fallback={<MapFallback />}>
          <MapView />
        </Suspense>
      </main>
      <StatsPanel />
      {drawerOpen && selectedCity && (
        <Suspense fallback={null}>
          <CityDrawer key={selectedCity.city_id} city={selectedCity} />
        </Suspense>
      )}
      {profileOpen && (
        <Suspense fallback={null}>
          <UserProfile />
        </Suspense>
      )}
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
