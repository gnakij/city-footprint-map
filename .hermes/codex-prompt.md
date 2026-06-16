Build a complete React + TypeScript + Vite web app "City Footprint Map" (城市足迹地图).

Working directory: /root/.openclaw/workspace/city-footprint-map
CRITICAL: Vite base is `/cityprint/`, deploy URL is https://www.gnakij.top/cityprint/

## Tech Stack
React 18, Vite, TypeScript, ECharts 5 (China map), Zustand, IndexedDB (idb), html2canvas, uuid. Use npm for package management. Import Inter font from Google Fonts CDN.

## What to Build - ALL Files Required

### 1. src/types/index.ts
Types: RecordMode ('duration'|'departure'), ThemeMode ('light'|'dark'), CityData (city_id, city_name, province, region, pinyin, level), DurationRecord, DepartureRecord, Achievement, AppSettings, ExportData, Stats.

### 2. src/data/cities.ts
Export array of 100+ Chinese cities. Each: { city_id: string, city_name: string (Chinese), province: string, region: string (华北/华东/华南/华中/西南/西北/东北), pinyin: string (lowercase no spaces), level: 'province'|'prefecture' }. Include ALL provincial capitals + major prefectures.

### 3. src/data/achievements.ts
Export ACHIEVEMENTS array with 6 items: first_light/初次点亮/🌟, ten_cities/十城达人/⭐, province_conqueror/省份征服者/🏆, hundred_club/百城俱乐部/💯, long_stay/长居达人/🏠, all_cities/全国制霸/👑. Each has id, name, description, icon emoji, and a check(records, cities) function.

### 4. src/data/china-geojson.ts
Export async function loadChinaGeoJSON(). Try fetch from https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json first. On failure, return hardcoded minimal GeoJSON with 34 province-level features. Each feature: { type:'Feature', properties:{name,id}, geometry:{type:'MultiPolygon',coordinates} }.

### 5. src/store/db.ts
IndexedDB using 'idb' package. DB name: 'city-footprint-db'. Stores: duration_records, departure_records, achievements, settings. Functions: getAllDuration, getAllDeparture, saveRecord, deleteRecord(id,mode), getAchievements, unlockAchievement(id), getSettings, saveSettings, exportAll (returns ExportData), importAll(data).

### 6. src/store/useStore.ts
Zustand store. State: mode, selectedCity, previewCity (for anti-mistouch), durationRecords, departureRecords, achievements, settings, drawerOpen, searchQuery, posterOpen, settingsOpen, toast. Actions cover all state changes with IndexedDB persistence. getStats() computes: litCount, totalCities, provinceCount, totalDays, coverage. On saveRecord: auto-check achievements.

### 7. src/utils/colors.ts
getDurationColor(days): 0=#F0F0F0, 1-3=#E3F2FD, 4-10=#90CAF9, 11-30=#42A5F5, 31-90=#1E88E5, 91-365=#1565C0, >365=#0D47A1
getDepartureColor(daysAgo): 0-30=#FF7043, 31-90=#FF8A65, 91-180=#FFAB91, 181-365=#FFCCBC, >365=#FBE9E7

### 8. src/utils/search.ts
fuzzySearch(query, cities) matches against city_name, province, pinyin. Returns top 8 sorted by match quality.

### 9. src/utils/export.ts
exportData(records, achievements, settings) returns ExportData. importData(jsonString) validates and returns {success, data?, error?}.

### 10. src/index.css
Full stylesheet with CSS custom properties:
- @import Inter font
- :root with ALL colors (primary #0050CB, primary-container #0066FF, secondary #A33800, tertiary #B30044, error #BA1A1A, background #FFFFFF, surface #FAF8FF, surface-container-low #F2F3FF, on-surface #131B2E, etc.)
- Duration gradient colors (l0-l6 blue), departure gradient (l1-l5 warm)
- Typography custom props, shape radii, spacing
- CSS reset, body styles, utility classes
- .btn-primary, .btn-outline, .btn-danger, .card, .glass, .input styles
- @keyframes slideUp, fadeIn, toastIn
- Mobile responsive breakpoints (<768px, 768-1024px, >1024px)

### 11. src/main.tsx
ReactDOM.createRoot, BrowserRouter basename="/cityprint", render App.

### 12. src/App.tsx
Main layout: TopBar + MapView + StatsPanel + CityDrawer + SettingsPanel modal + Toast. Load data from IndexedDB on mount. Wire up all store state.

### 13. src/components/TopBar.tsx
Fixed top bar with glass background. Logo "🏙️ 城市足迹". SearchDropdown. Mode toggle pill (停留时长/最后离开). Settings gear button. Mobile responsive.

### 14. src/components/SearchDropdown.tsx
Search input with dropdown. Fuzzy match cities (Chinese + pinyin). Max 8 results. Keyboard nav. Select pans map to city.

### 15. src/components/MapView.tsx
CORE COMPONENT. Load GeoJSON on mount, register with ECharts. Render China map with colored regions based on current mode. South China Sea inset bottom-right. ANTI-MISTOUCH: first click highlights, second click opens drawer. Already-lit: single click opens drawer. 300ms debounce click vs drag. Tooltip on hover. Re-render on mode change.

### 16. src/components/CityDrawer.tsx
Bottom sheet (mobile) / side panel (desktop). Shows city name + mode badge. Duration: number input (min=1). Departure: date input (max=today). Save/Cancel/Clear buttons. Validation: days>=1, date<=today. On save: write to IndexedDB, update store, check achievements.

### 17. src/components/StatsPanel.tsx
Desktop: right sidebar 280px. Mobile: bottom drawer 3 states (60px/50vh/90vh). Stats grid: 已点亮 X/Y, 覆盖 N省, 累计 D天, 覆盖率 X%. Progress bar 8px rounded. Achievement badges grid.

### 18. src/components/AchievementBadge.tsx
64px circle with emoji. Locked=grayscale opacity 0.4. Unlocked=colorful with shadow. Name in label-sm.

### 19. src/components/PosterGenerator.tsx
Modal. html2canvas capture of map+stats. 1080x1920 preview. Download PNG.

### 20. src/components/SettingsPanel.tsx
Modal. Theme toggle. Default mode. Export/Import/Clear data. About section.

### 21. src/components/Toast.tsx
Fixed top-center. Auto-dismiss 3s. Slide-in animation. Shows icon+message.

### 22. src/vite-env.d.ts
Standard Vite env types.

### 23. public/favicon.svg
Simple SVG: blue circle with footprint icon.

## CSS CUSTOM PROPERTIES - MUST include these exact values in :root:
--color-primary: #0050CB; --color-primary-container: #0066FF; --color-on-primary: #FFFFFF;
--color-secondary: #A33800; --color-secondary-container: #CD4800; --color-tertiary: #B30044;
--color-error: #BA1A1A; --color-background: #FFFFFF; --color-surface: #FAF8FF;
--color-surface-container-low: #F2F3FF; --color-surface-container: #EAEDFF;
--color-on-surface: #131B2E; --color-on-surface-variant: #424656; --color-outline-variant: #C2C6D8;
--color-dur-l0 through --color-dur-l6 (blue gradient); --color-dep-l1 through --color-dep-l5 (warm gradient);
--font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
--radius-sm: 8px; --radius-md: 16px; --radius-lg: 24px; --radius-full: 9999px;
--shadow-card: 0 4px 30px rgba(0,102,255,0.04); --shadow-glow: 0 8px 32px rgba(0,102,255,0.15);

## CRITICAL RULES
1. EVERY file must be COMPLETE with working code - NO stubs, NO placeholders, NO "// TODO"
2. All user-facing text in CHINESE
3. Mobile-first responsive design
4. Anti-mistouch MUST work: 2 clicks for unlit, 1 click for lit
5. South China Sea inset MANDATORY on map
6. IndexedDB persistence MUST work
7. npm install && npm run build MUST succeed with zero errors
8. vite.config.ts ALREADY EXISTS with base='/cityprint/' - do NOT recreate it
9. package.json, tsconfig.json, index.html ALREADY EXIST - do NOT recreate

Generate ALL 23 files NOW. Start immediately, write complete implementations.
