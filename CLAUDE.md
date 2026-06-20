

### .card/.modal等容器统一应用主题色（2026-06-20）

用户用两张截图对比Rose和Stripe主题下的"足迹统计"卡片：Rose整块卡片背景
带柔和粉调，Stripe完全是纯白/纯灰，要求所有用`.card`的地方（统计面板、
管理面板、各种弹窗等）都跟Rose一样应用主题色。

**根因**：Rose的`--color-surface`(#FFF5F7)是设计师手调的、本身带粉调的
色值（反推约等于纯白混入4%主色），Linear(#101215)/Stripe(#F7F8FA)的
`--color-surface`是中性灰/灰白，不带主题色调——跟之前TopBar的`--glass-bg`
是同一类问题（Rose天生带主题色调，其他两个主题不带）。

**方案**：新增`--card-tint-pct`变量，默认(Rose)0%（保留手调值不变，避免
浮点误差），Linear/Stripe覆盖为4%（从Rose反推值起步）。`.card`规则改用
`color-mix(in srgb, var(--color-primary) var(--card-tint-pct), var(--
color-surface))`。

**改动范围比预期广**：用户进一步要求"按钮、抽屉、统计面板title这些小元素
也一起改"。全局搜索后发现`--color-surface`被很多独立选择器直接写死引用，
不只是`.card`：`.modal`（弹窗，原来自己单独写background没用.card这个
class）、`.icon-btn`（图标按钮）、`.map-controls .btn-outline`、`.drawer`
（抽屉）、`.stats-panel > .panel-title`（统计面板sticky标题）、以及768px+
桌面端断点内的`.map-controls.glass`/`.map-level`/`.map-color-mode`/
`.stats-panel`/`.stats-collapsed-pill`五处独立覆盖——总共11处规则全部
统一改成同一个color-mix公式，共用`--card-tint-pct`这一个变量，以后调整
比例只需要改三处变量定义，不需要逐个改11处规则。

**这次主动应用了之前.glass踩过的优先级教训**：改完`.card`后没有立即部署，
先`grep`检查了全局是否存在更高优先级的`:root[data-theme=...] .card`之类
规则（结果：没有，.card这次是干净的），并且额外发现`.modal`原来用的是
独立选择器、不会被`.card`的改动覆盖到，主动补上了——避免了重复一次"改了
.card以为弹窗也会变、实际上弹窗用了别的选择器没受影响"的同类失误。部署后
用curl直接拉取线上CSS确认三处`--card-tint-pct`变量定义都生效（0%/4%/4%），
而不是只看build成功就假设生效。

已验证：`npx tsc --noEmit`/`npm run build`通过，已部署并用curl确认线上生效。
