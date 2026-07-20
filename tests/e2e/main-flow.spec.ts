import { expect, test, type Page } from '@playwright/test';

const adminUser = {
  id: 'admin-user',
  username: 'admin',
  name: '管理员',
  is_admin: true,
  created_at: '2026-07-20T00:00:00Z',
};

const visits = [
  {
    id: 'visit-1',
    city_id: 'beijing',
    duration_days: 500,
    last_stay_date: '2026-06-20',
    notes: '测试记录',
    created_at: '2026-06-20T00:00:00Z',
    updated_at: '2026-06-20T00:00:00Z',
  },
  {
    id: 'visit-2',
    city_id: 'guangzhou',
    duration_days: 30,
    last_stay_date: '2026-06-10',
    notes: '',
    created_at: '2026-06-10T00:00:00Z',
    updated_at: '2026-06-10T00:00:00Z',
  },
];

async function mockApi(page: Page) {
  await page.route('**/cityprint/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/cityprint/api', '');
    const method = route.request().method();

    if (path === '/bootstrap/status') {
      await route.fulfill({ json: { requires_admin_setup: false } });
      return;
    }
    if (path === '/auth/login' && method === 'POST') {
      await route.fulfill({ json: { access_token: 'mock-token', token_type: 'bearer', user: adminUser } });
      return;
    }
    if (path === '/users/me') {
      await route.fulfill({ json: adminUser });
      return;
    }
    if (path === '/users') {
      await route.fulfill({ json: [adminUser] });
      return;
    }
    if (path === '/visits') {
      await route.fulfill({ json: visits });
      return;
    }
    if (path === '/achievements') {
      await route.fulfill({ json: [] });
      return;
    }
    if (path === '/settings') {
      await route.fulfill({ json: { theme: 'azure' } });
      return;
    }
    if (path === '/stats/system') {
      await route.fulfill({ json: { totalUsers: 1, adminUsers: 1, totalVisits: visits.length } });
      return;
    }
    if (path === '/admin/data/export') {
      await route.fulfill({ json: { visits: [] } });
      return;
    }

    await route.fulfill({ status: 404, json: { detail: `Unhandled mock route: ${method} ${path}` } });
  });
}

async function loginAsAdmin(page: Page) {
  await mockApi(page);
  await page.goto('/');
  await page.getByRole('button', { name: '管理员登录' }).click();
  await page.getByPlaceholder('管理员用户名').fill('admin');
  await page.getByPlaceholder('密码').fill('password123');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByText('全国 · 城市')).toBeVisible();
  await expect(page.getByText('足迹统计')).toBeVisible();
}

test('admin login shows map shell and keyboard account menu works', async ({ page }) => {
  await loginAsAdmin(page);

  const accountButton = page.getByRole('button', { name: /管理员/ });
  await accountButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: '个人资料' })).toBeFocused();

  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: '主题选择' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(accountButton).toBeFocused();
  await expect(page.getByRole('menuitem', { name: '个人资料' })).toHaveCount(0);
});

test('admin panel tabs render without empty lazy gaps', async ({ page }) => {
  await loginAsAdmin(page);

  await page.getByRole('button', { name: /管理员/ }).click();
  await page.getByRole('menuitem', { name: '系统管理' }).click();
  await expect(page.getByRole('heading', { name: '管理员面板' })).toBeVisible();
  await expect(page.getByRole('button', { name: '用户管理' })).toBeVisible();

  await page.getByRole('button', { name: '系统文档' }).click();
  await expect(page.getByText('系统升级记录')).toBeVisible();

  await page.getByRole('button', { name: '数据管理' }).click();
  await expect(page.getByRole('button', { name: '查询' })).toBeVisible();
  await expect(page.getByRole('button', { name: '导入数据' })).toBeVisible();
});
