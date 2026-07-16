import type { StoreSet, StoreState } from '../types';

type UiSlice = Pick<
  StoreState,
  | 'drawerOpen'
  | 'searchQuery'
  | 'visitsOpen'
  | 'adminOpen'
  | 'statsOpen'
  | 'profileOpen'
  | 'statsCollapsed'
  | 'profileTab'
  | 'colorMode'
  | 'setSelectedCity'
  | 'setPreviewCity'
  | 'setDrawerOpen'
  | 'setSearchQuery'
  | 'setVisitsOpen'
  | 'setAdminOpen'
  | 'setStatsOpen'
  | 'setProfileOpen'
  | 'toggleStatsCollapsed'
  | 'setColorMode'
  | 'showToast'
  | 'hideToast'
>;

export function createUiSlice(set: StoreSet): UiSlice {
  return {
    drawerOpen: false,
    searchQuery: '',
    visitsOpen: false,
    adminOpen: false,
    statsOpen: false,
    profileOpen: false,
    statsCollapsed: false,
    profileTab: 'profile',
    colorMode: 'duration',

    setSelectedCity: (selectedCity) => set({ selectedCity, drawerOpen: Boolean(selectedCity) }),
    setPreviewCity: (previewCity) => set({ previewCity }),
    setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
    setSearchQuery: (searchQuery) => set({ searchQuery }),
    setVisitsOpen: (visitsOpen) => set({ visitsOpen }),
    setAdminOpen: (adminOpen) => set({ adminOpen }),
    setStatsOpen: (statsOpen) => set({ statsOpen }),
    setProfileOpen: (profileOpen, tab) => set({ profileOpen, ...(tab ? { profileTab: tab } : {}) }),
    toggleStatsCollapsed: () => set((state) => ({ statsCollapsed: !state.statsCollapsed })),
    setColorMode: (colorMode) => set({ colorMode }),
    showToast: (toast) => set({ toast }),
    hideToast: () => set({ toast: undefined }),
  };
}
