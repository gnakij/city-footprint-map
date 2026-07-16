import type { AppSettings, CityData, ColorMode, ExportData, Stats, User, VisitRecord } from '../types';

export type ProfileTab = 'profile' | 'visits';

export interface ToastState {
  message: string;
  icon?: string;
}

export interface StoreState {
  selectedCity?: CityData;
  previewCity?: CityData;
  visits: VisitRecord[];
  achievements: string[];
  settings: AppSettings;
  drawerOpen: boolean;
  searchQuery: string;
  visitsOpen: boolean;
  adminOpen: boolean;
  statsOpen: boolean;
  profileOpen: boolean;
  toast?: ToastState;
  hydrated: boolean;
  currentUser: User | null;
  users: User[];
  adminSetupRequired: boolean;
  statsCollapsed: boolean;
  profileTab: ProfileTab;
  colorMode: ColorMode;
  load: () => Promise<void>;
  setupAdmin: (username: string, password: string) => Promise<void>;
  loginAdmin: (username: string, password: string) => Promise<boolean>;
  loginUser: (username: string, password: string) => Promise<boolean>;
  switchUser: (user: User) => Promise<void>;
  logout: () => void;
  createRegularUser: (name: string) => Promise<User>;
  deleteUserAndData: (id: string) => Promise<void>;
  resetUserPassword: (id: string, password: string) => Promise<void>;
  setSelectedCity: (city?: CityData) => void;
  setPreviewCity: (city?: CityData) => void;
  setDrawerOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
  setVisitsOpen: (open: boolean) => void;
  setAdminOpen: (open: boolean) => void;
  setStatsOpen: (open: boolean) => void;
  setProfileOpen: (open: boolean, tab?: ProfileTab) => void;
  toggleStatsCollapsed: () => void;
  setColorMode: (mode: ColorMode) => void;
  showToast: (toast: ToastState) => void;
  hideToast: () => void;
  updateUserName: (name: string) => Promise<boolean>;
  updateAnyUserName: (userId: string, name: string) => Promise<void>;
  saveVisit: (city: CityData, input: Pick<VisitRecord, 'duration_days' | 'last_stay_date' | 'notes'> & { id?: string }) => Promise<boolean>;
  bulkCreateVisits: (records: Array<Pick<VisitRecord, 'city_id' | 'duration_days' | 'last_stay_date' | 'notes'>>) => Promise<void>;
  deleteVisit: (id: string) => Promise<void>;
  updateSettings: (settings: AppSettings) => Promise<void>;
  exportBackup: () => Promise<string>;
  importBackup: (data: ExportData) => Promise<void>;
  clearData: () => Promise<void>;
  getStats: () => Stats;
  getSystemStats: () => Promise<{ totalUsers: number; totalVisits: number; adminUsers: number }>;
}
