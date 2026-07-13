import type { AppSettings, ExportData, User, VisitRecord } from '../types';

interface AchievementRow {
  id: string;
  user_id: string;
  achievement_id: string;
  unlocked_at: string;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface AdminVisitExportRow extends VisitRecord {
  user_id: string;
  username: string;
  name: string;
}

const API_BASE = '/cityprint/api';
const TOKEN_KEY = 'cityprint-token';
const defaultSettings: AppSettings = { theme: 'rose' };

function _lsGet(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
function _lsSet(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } }
function _lsDel(k: string) { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } }

function setToken(token: string) { _lsSet(TOKEN_KEY, token); }
export function hasToken() { return Boolean(_lsGet(TOKEN_KEY)); }
export function clearToken() { _lsDel(TOKEN_KEY); }

// ── 统一请求函数，含错误处理 ─────────────────────────────────────────────
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = _lsGet(TOKEN_KEY);
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });

  // 401：token 失效，清除本地状态
  if (response.status === 401) {
    clearToken();
    throw new Error('登录已过期，请重新登录');
  }

  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      if (body?.detail) {
        if (Array.isArray(body.detail)) {
          // Pydantic 验证错误 → 提取可读消息
          detail = body.detail.map((item: unknown) => {
            if (item && typeof item === 'object' && 'msg' in item) return String(item.msg);
            return JSON.stringify(item);
          }).join('; ');
        } else {
          detail = String(body.detail);
        }
      } else if (body?.message) {
        detail = String(body.message);
      }
    } catch {
      detail = await response.text().catch(() => '');
    }
    throw new Error(detail || `请求失败 (${response.status})`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

// ── 认证 ──────────────────────────────────────────────────────────────────
export async function getCurrentUser() {
  return request<User>('/users/me');
}

export async function getBootstrapStatus() {
  return request<{ requires_admin_setup: boolean }>('/bootstrap/status');
}

export async function getUsers() {
  return request<User[]>('/users');
}

export async function createUser(name: string, options?: { username?: string; password?: string; is_admin?: boolean }) {
  const username = options?.username?.trim() || name.trim();
  const password = options?.password || 'changeme123';
  return request<User>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      username,
      password,
      name: name.trim(),
    }),
  });
}

export async function createManagedUser(name: string, options?: { username?: string; password?: string; is_admin?: boolean }) {
  const username = options?.username?.trim() || name.trim();
  const password = options?.password || 'changeme123';
  return request<User>('/users', {
    method: 'POST',
    body: JSON.stringify({
      username,
      password,
      name: name.trim(),
      is_admin: Boolean(options?.is_admin),
    }),
  });
}

export async function createInitialAdmin(name: string, options: { username: string; password: string }) {
  return request<User>('/bootstrap/admin', {
    method: 'POST',
    body: JSON.stringify({
      username: options.username.trim(),
      password: options.password,
      name: name.trim(),
      is_admin: true,
    }),
  });
}

export async function updateUser(user: User) {
  return request<User>(`/users/${user.id}`, {
    method: 'PUT',
    body: JSON.stringify({ username: user.username, name: user.name, is_admin: user.is_admin }),
  });
}

export async function updateMe(data: { name?: string; password?: string }) {
  return request<User>('/users/me', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function changePassword(userId: string, password: string) {
  return request<User>(`/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify({ password }),
  });
}

export async function verifyAdmin(username: string, password: string) {
  const user = await verifyUser(username, password);
  if (!user?.is_admin) {
    clearToken();
    return null;
  }
  return user;
}

export async function verifyUser(username: string, password: string) {
  try {
    const data = await request<TokenResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: username.trim(), password }),
    });
    setToken(data.access_token);
    return data.user;
  } catch {
    return null;
  }
}

export async function deleteUser(id: string) {
  await request<void>(`/users/${id}`, { method: 'DELETE' });
}

// ── 访问记录 ──────────────────────────────────────────────────────────────
export async function getAllVisits(_userId?: string) {
  return request<VisitRecord[]>('/visits');
}

function visitPayload(visit: Pick<VisitRecord, 'city_id' | 'duration_days' | 'last_stay_date' | 'notes'>) {
  return {
    city_id: visit.city_id,
    duration_days: visit.duration_days,
    last_stay_date: visit.last_stay_date,
    notes: visit.notes ?? null,
  };
}

export async function createVisit(_userId: string, visit: Pick<VisitRecord, 'city_id' | 'duration_days' | 'last_stay_date' | 'notes'>) {
  return request<VisitRecord>('/visits', {
    method: 'POST',
    body: JSON.stringify(visitPayload(visit)),
  });
}

export async function updateVisit(_userId: string, visitId: string, visit: Pick<VisitRecord, 'city_id' | 'duration_days' | 'last_stay_date' | 'notes'>) {
  return request<VisitRecord>(`/visits/${visitId}`, {
    method: 'PUT',
    body: JSON.stringify(visitPayload(visit)),
  });
}

/**
 * 修复：使用后端批量接口，而非逐条串行请求。
 * 后端 POST /visits 本身是单条，批量通过并发 Promise.all 实现，
 * 大幅减少导入耗时。
 */
export async function bulkSaveVisits(_userId: string, visits: VisitRecord[]) {
  const results = await Promise.all(
    visits.map((visit) =>
      request<VisitRecord>('/visits', {
        method: 'POST',
        body: JSON.stringify({
          city_id: visit.city_id,
          duration_days: visit.duration_days,
          last_stay_date: visit.last_stay_date,
          notes: visit.notes ?? null,
        }),
      })
    )
  );
  return results;
}

export async function deleteVisit(_userId: string, id: string) {
  await request<void>(`/visits/${id}`, { method: 'DELETE' });
}

// ── 成就 ──────────────────────────────────────────────────────────────────
export async function getAchievements(_userId?: string) {
  return request<AchievementRow[]>('/achievements');
}

export async function unlockAchievement(_userId: string, achievementId: string) {
  await request<AchievementRow>('/achievements', {
    method: 'POST',
    body: JSON.stringify({ achievement_id: achievementId }),
  });
}

// ── 设置 ──────────────────────────────────────────────────────────────────
export async function getSettings(_userId?: string) {
  return request<AppSettings>('/settings').catch(() => defaultSettings);
}

export async function saveSettings(_userId: string, settings: AppSettings) {
  await request<AppSettings>('/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

// ── 数据管理 ──────────────────────────────────────────────────────────────
export async function clearAllData(_userId?: string) {
  await request<void>('/data/clear', { method: 'POST' });
}

export async function exportAll(_userId?: string): Promise<ExportData> {
  return request<ExportData>('/data/export', { method: 'POST' });
}

export async function importAll(_userId: string, data: ExportData) {
  await request<ExportData>('/data/import', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function adminExportVisits(userIds: string[]) {
  return request<{ visits: AdminVisitExportRow[] }>('/admin/data/export', {
    method: 'POST',
    body: JSON.stringify({ user_ids: userIds }),
  });
}

export async function adminImportVisits(
  userId: string,
  visits: Array<Pick<VisitRecord, 'city_id' | 'duration_days' | 'last_stay_date' | 'notes'>>
) {
  return request<{ inserted_count: number }>('/admin/data/import', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, visits }),
  });
}

// ── 系统统计 ──────────────────────────────────────────────────────────────
export async function getSystemStats() {
  return request<{ totalUsers: number; totalVisits: number; adminUsers: number }>('/stats/system');
}
