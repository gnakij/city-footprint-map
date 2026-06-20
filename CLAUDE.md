

### 顶栏主题色比例第三次调整：Rose/Linear 14%->10%，Stripe 22%->30%（2026-06-20）

用户在确认22%效果后又要求进一步调整：Rose/Linear共用的默认值从14%降到
10%，Stripe从22%提高到30%。两个`--topbar-tint-pct`定义都已更新（:root
默认值、`:root[data-theme="stripe"]`覆盖值）。已用curl直接拉取线上CSS
文件确认这两个值正确生效，不只看本地dist/目录或文件名hash判断。

已验证：`npx tsc --noEmit`通过，`npm run build`通过，已部署。
