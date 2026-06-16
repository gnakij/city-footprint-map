# City Footprint Map — Product Spec

## Overview
A React web app where users light up Chinese cities they've visited on an interactive map. Two independent recording modes with color gradients, local storage persistence, statistics dashboard, achievements, and poster sharing. Mobile-first, deployed under nginx /cityprint/ path prefix.

## Tech Stack
- React 18 + Vite + TypeScript
- ECharts 5 with China GeoJSON map
- Zustand for state management
- IndexedDB (via idb wrapper) for local persistence
- html2canvas for poster generation
- Deploy: static build served by nginx under /cityprint/

## DESIGN SYSTEM — "Luminous High-Energy System"

### Colors
- Primary / Stay Duration Mode: Electric Blue #0066FF (primary-container), #0050CB (primary)
- Last Departure Mode: Sun-Kissed Orange #FF5C00, Coral #FF3D71
- Background: Crisp White #FFFFFF
- Surface containers: #F2F3FF (low) → #EAEDFF → #E2E7FF → #DAE2FD (highest)
- Text: #131B2E (on-surface), #424656 (on-surface-variant)
- Error: #BA1A1A

### Typography — Inter exclusively
- headline-xl: 48px/56px, Extra Bold 800, -0.04em
- headline-lg: 32px/40px, Bold 700, -0.02em
- headline-lg-mobile: 28px/36px, Bold 700, -0.02em
- headline-md: 24px/32px, Bold 700
- body-lg: 18px/28px, Regular 400
- body-md: 16px/24px, Regular 400
- label-bold: 14px/20px, Semibold 600, +0.05em
- label-sm: 12px/16px, Medium 500

### Shapes
- Buttons/inputs: 8px radius
- Cards/containers: 16px radius
- Hero modules: 24px radius

### Layout
- Desktop: 12-col grid, 64px margins, max-width 1280px
- Mobile: 4-col grid, 20px margins
- Section gap: 80px
- Card internal padding: min 32px

### Elevation — "Luminous Layers"
- Level 0 (Base): Pure White
- Level 1 (Cards): Soft shadow, blur 30px, opacity 4%, blue-tinted
- Level 2 (Modals): 20px backdrop blur, glass effect
- No solid borders; use tonal background changes

### Components
- Primary buttons: solid fill (blue/orange), white label-bold text, glow hover
- Cards: no border, soft shadow, 32px padding
- Inputs: 1px glass border, animate to 2px on focus
- Progress bars: 8px thick, rounded caps, gradient fill

## Features (from PRD v2.0)

### 1. Map Display (P0)
- Full China map with province and prefecture-level GeoJSON
- ECharts Map with smooth zoom/pan
- South China Sea inset (常驻右下角)
- Province/prefecture view toggle

### 2. Two Recording Modes (P0)
- **Stay Duration Mode**: input days stayed, blue gradient (1-3/4-10/11-30/31-90/91-365/>365 → 6 levels)
- **Last Departure Mode**: input departure date, warm gradient (0-30/31-90/91-180/181-365/>365 days ago)
- Both modes store independently — same city can have both records
- Toggle mode button in top bar, map re-renders on switch

### 3. City Interaction — Anti-mistouch (P0)
- First click: highlight preview (light outline)
- Second click: open edit drawer (bottom sheet on mobile)
- Drawer shows: city name (read-only), mode-specific input, save/cancel, clear record (if lit)
- Already-lit city: single click opens edit drawer directly

### 4. Statistics Panel (P0)
- Bottom drawer on mobile, right sidebar on desktop
- Metrics: lit cities / total, province count, total stay days, coverage %
- Three states: collapsed (60px summary), half (50vh stats), full (90vh full list)

### 5. Data Persistence (P0)
- IndexedDB storage, separate stores for duration/departure/achievements/settings
- Export JSON with version header
- Import JSON with validation and error handling

### 6. City Search (P1)
- Search bar in top bar
- Pinyin + Chinese fuzzy match
- Live dropdown (max 8 results)
- Select → map pans/zooms to city

### 7. Achievement System (P1)
- Badges: first city, 10 cities, province complete, 100 cities, 365+ days, all cities
- Auto-check on record save
- Toast notification on unlock

### 8. Poster Generation (P1)
- Render current map + stats + badges to image
- html2canvas, 1080×1920 portrait
- Download or share

### 9. Theme Support (P2)
- Light mode (default)
- Dark mode (dark map + light gradients)
- Custom color scheme

### 10. Mobile Responsiveness
- Breakpoints: <768px (full map + bottom drawer), 768-1024px (70/30 split), >1024px (75/25 split)
- Touch: pinch-zoom map, tap city, swipe drawer
- 200ms delay to distinguish tap vs drag
- Keyboard: panel shifts up on input focus

## Data Model

### City base data (GeoJSON properties)
```json
{ "city_id": "1100", "city_name": "北京市", "province": "北京市", "region": "华北", "level": "province" }
```

### Duration record
```json
{ "record_id": "uuid", "city_id": "1100", "mode": "duration", "duration_days": 120, "created_at": "ISO", "updated_at": "ISO" }
```

### Departure record
```json
{ "record_id": "uuid", "city_id": "1100", "mode": "departure", "last_departure": "2024-12-20", "created_at": "ISO", "updated_at": "ISO" }
```

## Storage Keys (IndexedDB)
- DB name: city-footprint-db
- Stores: duration_records, departure_records, achievements, settings

## Acceptance Criteria
1. Click unlit city → confirm → input 5 days → save → city shows Level 2 blue + stats +1
2. Click lit city → change to 35 days → color updates to Level 4
3. Clear record → city returns to base gray + stats -1
4. Toggle to departure mode → map redraws with warm gradient, original data preserved
5. Search "成都" → map pans/zooms to Chengdu with highlight
6. Export → downloads valid JSON file
7. Import exported file → records restored exactly
8. Quick drag across map → no accidental city activation
9. Days=0 → rejected with message
10. Future date → rejected

## Nginx Deploy
- Build output: dist/
- Served under: https://gnakij.top/cityprint/
- Vite base: /cityprint/
- React Router basename: /cityprint
- Static file serving, no backend needed

## File Structure
```
src/
├── main.tsx
├── App.tsx
├── index.css (DESIGN.md tokens as CSS custom properties)
├── components/
│   ├── MapView.tsx (ECharts China map)
│   ├── CityDrawer.tsx (edit panel / bottom sheet)
│   ├── StatsPanel.tsx (statistics)
│   ├── TopBar.tsx (search + mode toggle)
│   ├── AchievementBadge.tsx
│   ├── PosterGenerator.tsx
│   ├── SettingsPanel.tsx
│   └── SearchDropdown.tsx
├── store/
│   ├── useStore.ts (Zustand)
│   └── db.ts (IndexedDB)
├── data/
│   ├── china-geojson.ts (GeoJSON data)
│   ├── cities.ts (city metadata)
│   └── achievements.ts
├── utils/
│   ├── colors.ts (color gradient logic)
│   ├── export.ts (JSON export/import)
│   └── search.ts (fuzzy search)
└── types/
    └── index.ts
```
