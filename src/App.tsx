import { lazy, Suspense, useEffect } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import LoginPage from './components/LoginPage';
import StatsPanel from './components/StatsPanel';
import Toast from './components/Toast';
import TopBar from './components/TopBar';
import { useStore } from './store/useStore';

// 地图相关组件延迟加载（含 ECharts ~1MB，首屏不需要）
const MapView = lazy(() => import('./components/MapView'));
const CityDrawer = lazy(() => import('./components/CityDrawer'));
const UserProfile = lazy(() => import('./components/UserProfile'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));

function Loading() {
  return (
    <div className="app-loading" role="status" aria-live="polite">
      <div className="loading-spinner" aria-hidden="true" />
      <span>正在进入…</span>
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
  const adminOpen = useStore((state) => state.adminOpen);

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
      {/* 2026-06-20: "系统管理"从个人资料弹窗的tab里移出来，改成TopBar账号
          下拉菜单的独立入口，对应这里独立挂载的AdminPanel（非embedded模式，
          组件内部会渲染成自己的.modal-backdrop弹窗）。adminOpen状态此前已
          存在于store（管理员登录/创建时会被设为true），但一直没有渲染入口
          消费它，是个遗留的"半成品"状态——这次补上挂载点。 */}
      {adminOpen && (
        <Suspense fallback={null}>
          <AdminPanel />
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
