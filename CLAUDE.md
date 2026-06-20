# 项目约定

## 标准组件库

`src/components/ui/` 在这个项目里是一个**符号链接**，指向服务器级共享目录
`/root/.openclaw/workspace/shared-ui-components/react/src`——这是这台服务器上
所有项目共用的标准基础交互组件库，不属于本项目，改动会影响所有引用它的项目。

**任何改动这个项目代码的人（包括 AI 助手）在用到日期选择、下拉框等基础交互控件之前，必须先看 `src/components/ui/README.md`**（实际是共享目录里的 README），确认是否已有标准实现：
- 已有 → 直接引用，禁止重新重写一遍。
- 没有，且确实是会被多个项目复用的基础控件 → 加进共享目录（不是本项目的 `ui/` 文件夹本身，因为那只是软链接），并更新共享目录的 README。
- 只在本项目内复用、跟其他项目无关的业务组件 → 正常放在 `src/components/` 下，不要往共享目录里塞。

这条规则的目的：用户只需要说"用标准样式的组件"，不需要每次重新描述具体交互细节，
协作者（人或 AI）就该知道去共享目录找现成实现，且新项目天然就能复用，不用重新搭建。

详见共享库自己的说明：`/root/.openclaw/workspace/shared-ui-components/README.md`

## UI 样式规范

所有新组件必须遵循以下规范，定义在 `src/index.css` 中。

### 设计 Token 分层（2026-06-19 起）

CSS 变量分两层，新写样式时优先用语义层，不要直接用原始层：

- **原始层**（数值本身，命名按大小关系）：`--radius-sm/md/lg/full`、`--space-1`~`--space-6` 等
- **语义层**（按用途命名，新组件应优先引用这一层）：
  - `--radius-panel`（12px）：卡片、模态框、表单容器等"面板"类元素
  - `--radius-control`（8px，= `--radius-sm`）：输入框等小型控件
  - `--radius-pill`（9999px，= `--radius-full`）：按钮、徽章、页签
  - `--transition-interactive`：`opacity` + `transform` + `background` 三属性统一过渡，按钮/列表项/图标按钮等可交互元素的 hover/active 都应该用这条，不要手写 transition 数值
  - `--transition-color`：`color` + `border-color` 过渡，用于纯文字/边框颜色变化场景（如 tab 切换）
  - `--state-hover-opacity`（0.88）/ `--state-active-scale`（0.97）/ `--state-disabled-opacity`（0.45）：交互状态强度，按钮类组件统一引用，不要手写数值

新增"面板类"组件（卡片、弹窗、独立信息块）一律用 `--radius-panel`，不要复用 `--radius-sm`——
后者专属输入框等控件类，二者历史上长期共用同一个变量，已于本次拆开。

### 字重（font-weight）

| 值 | 用途 |
|----|------|
| 500 | 辅助说明、标签、序号、空状态提示 |
| 600 | 按钮文字、次要标题、列表项文字 |
| 700 | 核心数据、品牌标识、当前状态 |
| 800 | 强调数据、图标按钮、地图标签 |

### 按钮

| 类型 | 高度 | padding | 字号 | 圆角 | 用途 |
|------|------|---------|------|------|------|
| `.btn-primary` | 36px | 0 14px | 13px | 9999px | 主操作（保存、确认、添加） |
| `.btn-outline` | 36px | 0 14px | 13px | 9999px | 次操作（取消、导入、导出） |
| `.btn-danger` | 36px | 0 14px | 13px | 9999px | 危险操作（删除、清空） |
| `.btn-outline.small` | 30px | 0 10px | 12px | 9999px | 小型次操作 |
| `.icon-btn` | 36px | 0 | 18px | 9999px | 图标按钮（×、+、−） |

**交互规范**：
- hover: `opacity: var(--state-hover-opacity)`（0.88）
- active: `transform: scale(var(--state-active-scale))`（0.97）
- disabled: `opacity: var(--state-disabled-opacity)`（0.45）；`cursor: not-allowed`（保持主色背景，不变灰）
- 过渡统一用 `transition: var(--transition-interactive)`
- 所有按钮加 `white-space: nowrap` 防折行

### 列表项按钮

| 属性 | 值 |
|------|-----|
| `.list-button` 圆角 | `var(--radius-panel)`（12px） |
| padding | 14px 16px |
| hover 背景 | `var(--color-surface-container-low)` |
| hover 边框 | `var(--color-primary-container)` |
| 过渡 | `var(--transition-interactive)` |
| 主文字字重 | 600 |
| 辅助小字字重 | 500 |
| 文字 | `white-space: nowrap` |

### 操作按钮组（`.actions`）

一组操作按钮（如表单底部的"保存/取消"、弹窗底部按钮）统一用 `.actions` 容器，
默认 `justify-content: flex-end`（靠右对齐）。需要其他对齐方式时叠加修饰类，
不要另起一套写法：
- 居中：`.actions.flex-center`
- 两端对齐（如"统计文字 + 按钮"同行）：`.actions.flex-between`

### 页签（mode-pill）

| 属性 | 值 |
|------|-----|
| 容器圆角 | 12px |
| 按钮圆角 | 10px |
| padding | 10px 16px |
| 字号 | 13px |
| 字重 | 700 |
| active 背景 | `var(--color-primary)` |
| active 文字 | `#fff` |

### 颜色变量

三套主题（Rose/Linear/Stripe）都定义了以下变量：

| 变量 | 用途 |
|------|------|
| `--color-primary` | 主色 |
| `--color-background` | 页面背景 |
| `--color-surface` | 卡片/面板背景 |
| `--color-on-surface` | 主要文字 |
| `--color-on-surface-variant` | 次要文字 |
| `--color-outline-variant` | 边框 |
| `--color-error` | 错误色 |
| `--color-success` | 成功色 |
| `--color-warning` | 警告色 |

**注意**：地图省界市界边框颜色是硬编码的，不跟随主题。当前值：省界轮廓
`borderColor: #666666, borderWidth: 0.5`（细灰色描边，2026-06-19 由原暗紫红
`#B98A98` / 1.8px 调整而来，原因：移动端反馈省界线"太粗、发黑"）。

### 设计原则

- 保持温馨旅行日记风格
- 圆角统一：按钮 9999px（胶囊形，`--radius-pill`），卡片/面板 12px（`--radius-panel`），列表项 12px（`--radius-panel`）
- 过渡动画：可交互元素统一 `var(--transition-interactive)`（opacity 0.15s + transform 0.1s + background 0.15s）；纯颜色变化用 `var(--transition-color)`
- 操作按钮组默认靠右对齐（`.actions`），见上方"操作按钮组"
- 不改字重、地图边框、主题色

## 部署流程

```
cd /root/.openclaw/workspace/city-footprint-map
npx tsc --noEmit          # 类型检查
npm run build             # 构建
rsync -a dist/ /var/www/cityprint/        # 部署前端（不用 --delete，保留 docs 目录）
cp -r docs /var/www/cityprint/            # 同步文档
chmod 644 /var/www/cityprint/docs/*.md    # 确保文档可读
```

**注意**：不要用 `rsync --delete`，会删掉 `/var/www/cityprint/docs/` 目录（docs 不在 dist 里）。

线上地址：https://www.gnakij.top/cityprint/
后端服务：`cityprint-api.service`（127.0.0.1:8001）

## 地图性能优化记录（2026-06-19）

地图（`MapView.tsx`）渲染用的是 ECharts `map` 类型，不是 Leaflet/Mapbox 等地图引擎。
全国视图下实际叠了**两个独立的 series**：主图层（369个地级市色块）+ 省界轮廓层
（33个省级行政区，只画粗边框和省名 markPoint）。这个双层结构是后续几个问题的共同背景。

### 已修复

1. **nginx 缓存策略**：原配置把 `/cityprint/` 整个目录设成 `no-cache, no-store`，
   导致每次打开都重新下载全部资源。现已拆分：`index.html` 保持不缓存，
   `assets/`（带 content-hash 的 JS/CSS）强缓存1年 `immutable`，
   `geojson/`（行政边界数据，文件名不带hash）缓存7天+协商缓存。
   配置在 `/etc/nginx/sites-enabled/hr-advisor`。

2. **`devicePixelRatio` 钳到 2**：`echarts.init(el, null, { devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2) })`，
   避免高清屏（iPhone等3x）按3倍像素渲染369个色块导致每帧重绘成本过高。

3. **双指 pinch 缩放+平移全部走 CSS transform**：pinch 过程中用
   `dom.style.transform = translate() scale()` 直接操作 ECharts 容器（GPU合成，
   不触发任何重绘），松手时才把累积的缩放和位移一次性换算成单次 `dispatchAction`
   同步给 ECharts。这是这次优化的核心改动，之前的实现漏了"双指平移"这个分量
   （只有缩放走了CSS transform，平移仍在每帧真实调用 `dispatchPan`），
   导致pinch时只要带一点位移（人手几乎不可能零位移）就会触发两层共400多个path的
   完整重绘，是真正的卡顿根因。

4. **移动端触摸期间屏蔽 hover 预览**：移动端浏览器会把手指滑动模拟成
   `mouseover`/`mousemove` 事件，触发 ECharts 原生的高亮+tooltip+`setPreviewCity`
   （进而引发组件重渲染和完整 `setOption`）。这条路径跟pinch手势本身无关
   （单指划过也会触发），但同样拖慢移动端体验。用 `isTouchingRef` 标志位
   在任意手指接触屏幕期间屏蔽 `mouseover` 回调，鼠标场景不受影响。

5. **删除了一个"优化"自带的副作用**：曾经实现过"pinch时隐藏省名标签减少重绘"，
   但它自己用 `chart.setOption(...)` 实现隐藏/恢复，这个调用本身就是一次完整
   ECharts重绘——在双指按下/松手两个时间点各引入了一次不必要的卡顿。已删除整个
   `setProvinceLabelsVisible` 逻辑；现在 pinch 时标签直接跟着 CSS transform
   整体缩放（可能有极轻微的临时模糊，松手后立即清晰），不再隐藏。

### 已知问题（未修复，不紧急）

**市级地图缩放后切回省级/全国视图，两层（主图层+省界轮廓层）会有约0.1秒的
短暂分离**，肉眼可见但不影响功能，最终会自动对齐。

根因：省界轮廓层只在全国视图存在（`activeProvince ? [] : [...]`），省级视图
切回全国视图时触发 `provinceChanged=true` 的全量重建（`notMerge`），ECharts
要在同一次 `setOption` 里同时新建两个独立的 series 并分别设置初始
`zoom: 1.1`。这两个新建的图层理论上应同时定位到位，但因为是两个独立渲染对象，
ECharts内部建立/绘制的时机如果有微小先后差，就会表现为短暂分离。这跟代码里
另一处注释提到的"缩放超过scaleLimit上限会导致两层持续分离"是同一类结构性
风险（两个独立series各自维护几何变换状态），只是诱因不同（一个是视图重建瞬间，
一个是缩放越界累积）。

修复需要改变两层的渲染时序保证方式（比如合并成一层渲染，或确保两者创建严格
同步），改动风险高于之前几项，决定暂不处理，留作后续参考。

## 文档维护规则（2026-06-20 起）

项目有三份文档，协作者（人或 AI）改动代码时必须同步更新。详见 `docs/协作者指南-2026-06-20.md`。

### 文档清单

| 文档 | 路径 | 何时更新 |
|------|------|----------|
| 设计系统文档 | `docs/设计系统-2026-06-20.md` | 新增/修改 CSS 变量、组件样式、可访问性 |
| 功能现状文档 | `docs/功能现状-2026-06-19.md` | 新增/修改/删除功能 |
| 协作者指南 | `docs/协作者指南-2026-06-20.md` | 文档维护规则变更时 |

### 更新步骤

1. 修改对应文档内容
2. 更新文档头部 `last_updated: YYYY-MM-DD`
3. 在文档头部 `changelog` 数组**顶部**追加一条变更记录
4. 在 `src/components/AdminPanel.tsx` 的 `CHANGELOG` 数组**顶部**追加升级记录
5. git commit message 写清楚改动内容

### 不需要更新文档的情况

- 纯 bug 修复（不改功能行为）
- 注释、格式调整
- 内部重构（不改对外接口）
