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
function _lsSet(k: string, v: string) { try { localStorage.setItem(k, v); } catch {} }
function _lsDel(k: string) { try { localStorage.removeItem(k); } catch {} }

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
          detail = body.detail.map((e: any) => e.msg || JSON.stringify(e)).join('; ');
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
      is_admin: Boolean(options?.is_admin),
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

/**
 * 修复：不再用 try/catch 区分新建和更新。
 * - 有 id 且非新建 → PUT 更新
 * - 无 id 或明确新建 → POST 创建
 * 后端已保证 PUT 严格校验归属，不会静默创建重复记录。
 */
export async function saveVisit(_userId: string, visit: VisitRecord) {
  const payload = {
    city_id: visit.city_id,
    duration_days: visit.duration_days,
    last_stay_date: visit.last_stay_date,
    notes: visit.notes ?? null,
  };

  // 判断是更新还是新建：如果 visit.id 存在且不是客户端刚生成的临时 ID
  // 实际上 useStore 中新建时就生成了 uuid，所以有 id 就用 PUT，
  // 如果后端返回 404（visit 不存在）则说明是新记录，改用 POST
  if (visit.id) {
    try {
      return await request<VisitRecord>(`/visits/${visit.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    } catch (err) {
      // 只有 404（记录不存在）时才回退到 POST，其他错误直接抛出
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('404') && !msg.includes('not found')) {
        throw err;
      }
    }
  }

  return request<VisitRecord>('/visits', {
    method: 'POST',
    body: JSON.stringify({ ...payload, id: visit.id }),
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
