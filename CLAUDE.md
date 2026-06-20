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

# 清理 assets/ 里的旧版本 hash 文件（assets/ 强缓存 immutable，从不自动清理，
# 每次构建都会新增一批新 hash 文件，旧文件不会被覆盖，需手动清理，
# 但不能对整个目录用 rsync --delete，见上方注意事项）
ls /var/www/cityprint/assets/ | sort > /tmp/live_assets.txt
ls dist/assets/ | sort > /tmp/needed_assets.txt
comm -23 /tmp/live_assets.txt /tmp/needed_assets.txt > /tmp/to_delete.txt
cd /var/www/cityprint/assets && while read f; do rm -f "$f"; done < /tmp/to_delete.txt
```

**注意**：
- 不要用 `rsync --delete`，会删掉 `/var/www/cityprint/docs/` 目录（docs 不在 dist 里）。
- `assets/` 目录需要单独清理旧 hash 文件（见上方清理步骤），否则会无限堆积废弃的历史版本 JS/CSS。

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

### ⚠️ 给后续协作者（人或 AI）的重要提醒

这个项目的地图模块（`MapView.tsx`）出过的问题数量多、原因杂，且因为对话/会话
有长度限制，排查记录分散在多次独立会话里，**没有哪一次对话能看到完整历史**。
2026-06-20 一次实例排查"放大后两层错位"时，差点被另一条记录里"听起来很确定"
的诱因分析带偏——那条记录最后被证明是真实存在的次要问题，但不是当时用户反馈
的那个症状的根因，且写得像是已经验证过的结论。

**因此本节的每一条记录都标注了"验证状态"，请认真区分对待**：
- **[已验证]**：有可复现的量化证据（如 shapely 算出的具体数值、实测对比），
  不是单纯的代码推理。
- **[推测，未实测验证]**：基于读代码/读 ECharts 源码得出的合理解释，但没有
  实际复现确认这就是用户看到的现象的根因。**遇到这类记录，应该重新独立验证
  一次，而不是直接采信去做修复或排除其他可能性。**
- **[已修复]**：连带写明修复方式和验证证据；**[未修复]** 同理写明已知最佳
  推测+为什么没处理。

排查这类问题时建议的方法论（来自2026-06-20的实际经验）：
1. 先问清楚**精确**的复现条件（一次触发还是要累积？哪个具体操作？哪个具体
   省份/区域？），不要满足于"放大后错位"这种笼统描述就开始推理。
2. 静态读代码得出的假设，标注为推测，**优先用量化工具验证**（这个项目里
   GeoJSON 几何对比用 shapely 的 `intersection`/`union` 算 IoU、对比 bbox，
   不要靠目测/读注释/读ECharts文档的字面意思下结论）。
3. 即使修复后构建无报错，也只代表"代码逻辑自洽"，不代表"视觉效果真的对了"——
   这类问题最终必须由用户在浏览器实测确认，AI 协作者没有可视化调试能力。
4. 修复后如果用户反馈"还是不对/不一样了"，不要默认是同一个问题没修干净，
   要重新追问精确复现条件，很可能是另一个独立问题（2026-06-20 的两次修复
   就是这种情况：第一次修的是真实存在但次要的问题，第二次才是真正根因）。

### 地图问题排查记录

**问题1：全国视图放大后，主图层（市级色块）与省界轮廓层错位** [已修复 2026-06-20]

用户精确复现条件：双指 pinch 缩放，**第一次缩放就立刻出现**，不需要累积操作；
缩小回去能恢复正常。

排查过程中出现过两次不同的诱因假设，记录下来是为了让后续协作者理解"看起来
合理的代码推理 ≠ 真正命中用户反馈的症状"：

- **诱因A（边界钳位分叉）[已验证存在，但不是本次症状的根因]**：ECharts 对
  `geoRoam` 的 zoom 钳位（`scaleLimit`）是每个 series 各自用自己的
  `previousZoom` 独立计算的（源码见 `node_modules/echarts/lib/action/roamHelper.js`
  的 `updateCenterAndZoom`）。两个 series 收到完全相同的 zoom 增量，但只要
  某一帧其中一层先撞到 0.5~12 的边界、另一层还没撞到，二者会产生缩放倍率分叉
  且不会自愈。已修复：`dispatchZoom` 改为先用 `currentZoomRef` 算出裁剪后的
  目标总缩放，再反推统一的"有效增量"广播给所有 series（见该函数内详细注释）。
  同时发现触摸pinch手势走的是另一条独立的手写 `dispatchAction` 逻辑，完全
  绕开了这个修正，已统一改为调用 `dispatchZoom`。
  **这次修复是真实有效的，但用户实测反馈"放大依然有偏差"——说明这不是用户
  反馈症状的主要根因**，这个分叉机制需要"撞到边界"才触发，不解释"一缩放
  就立刻偏差"。

- **诱因B（真正根因，[已验证]）**：用 shapely 量化对比
  `china-cities.json`（市级）和 `china-provinces-outline.json`（省级轮廓）
  的整体几何 bbox，发现纬度最小值相差0.12度（5.0603 vs 4.9398）。逐省排查
  定位到差异集中在海南省（含三沙市，纬度延伸到南海诸岛、是全国最南端）：
  省级轮廓文件里的海南省几何，并非市级图里海南省下属19个市县的精确并集
  （IoU仅0.987），因为 `china-provinces-outline.json` 当时是来自某次独立的
  处理流程生成，并非直接从 `china-cities.json` union 出来。这个局部差异虽小，
  但恰好落在全国地图最南端边界上，被 ECharts 放大成两个 series 坐标系初始
  投影比例的差异——两层用同一套 dx/dy/zoom 像素增量广播，但各自坐标系到
  像素的映射比例从渲染那一刻起就不同，因此放大后**立刻**可见错位，不需要
  累积，与诱因A是完全不同性质的问题。
  修复：新增 `scripts/regen_province_outline.py`，直接从 `china-cities.json`
  精确 union 重新生成省级轮廓，确保两份文件永久同源。重新生成后两份文件
  bbox 四个维度差异全部为0.0，海南省 IoU 从0.987提升到1.0。
  **以后市级数据更新后，必须重跑这个脚本，否则会再次出现脱节。**
  **这次修复同样是真实有效的，但仍然没有命中用户后续反馈的"整体往上偏一点点"
  这个症状**——诱因A和诱因B都解决了真实存在的问题，但都不是诱因C。

- **诱因C（这次真正解决了用户反馈症状，[未100%查实机制，但已被用户用真实
  设备录屏验证修复有效]）**：用户提供了两段真实设备录屏，第二段清楚拍到
  "忻州市"色块的边界明显跑出了山西省轮廓线之外。用 shapely 验证忻州市的
  地理坐标完全落在山西省轮廓内（超出面积为0），排除了几何数据问题。用
  ECharts 真实内部模块（`Geo`类、`updateCenterAndZoom`）模拟单次pinch缩放
  的完整状态转换链路，两个坐标系算出的像素位置完全一致——**静态模拟没能
  复现这个偏移，说明诱因比诱因A/B更隐蔽，截至修复时仍未查实具体内部机制**。
  修复方式不再继续猜测"为什么会分叉"，改为更直接的工程手段：放弃"两个
  series 各自独立广播相同增量、各自计算"的方案，改为只驱动主图层
  (series 0)，再用 ECharts 公开 API (`getZoom`/`getCenter`) 读取它的真实
  渲染状态，原样复制给省界轮廓层(series 1)，省界轮廓层不再做任何独立计算，
  永远是主图层的镜像。用户实测确认修复有效（"非常好解决了"）。
  **重要：这次没有查清楚之前两次为什么会分叉的具体机制，只是换了一种结构上
  更不容易产生分叉的实现方式。如果以后类似问题再次出现，不代表这次修复是
  错的，可能是别的尚未发现的诱因——遇到这种"反复出现、屡次修复看似有效但
  症状重现"的情况，比起继续猜测代码逻辑，优先请用户提供真实设备录屏。**

**问题2：市级地图缩放后切回省级/全国视图，两层有约0.1秒短暂分离**
[未修复，推测如下，不紧急——影响视觉但自动归位，不影响功能；用户已知晓并
明确接受，2026-06-20 用诱因C的方案修复问题1之后，用户确认这个问题依然存在，
属于预期内、不算回归]

根因推测：省界轮廓层只在全国视图存在，省级视图切回全国视图时触发
`provinceChanged=true` 的全量重建（`notMerge`），ECharts要在同一次
`setOption` 里同时新建两个独立series。这两个新建图层理论上应同时定位到位，
但因为是两个独立渲染对象，内部建立/绘制时机若有微小先后差，会表现为短暂分离。

**这是问题1诱因A/B/C之外的另一种可能性，暂未用量化方法验证，仅为读代码后的
合理推测。** 如果以后要修，不要直接套用问题1任何一种修复方式——先确认这
0.1秒分离本身的精确触发条件和视觉表现，再判断是否真的是同一类"双series各自
维护状态"的结构性问题，还是别的原因（比如纯渲染时序，跟几何数据或缩放计算
都无关）。**不要把这个问题和问题1的诱因C修复混为一谈去验证——诱因C修复的
是"持续性、不会自愈的错位"，这个问题2是"短暂、会自愈的分离"，性质不同，
用户也明确表示不需要现在处理。**

**问题3：地图放大/缩小速度感觉对不上** [已修复，用户2026-06-20确认"非常完美地解决"]

用 `conversation_search` 找到了历史排查过程（早于本文档建立之前的某次会话），
记录下来供参考：

真正根因（[已验证，当时通过实测反复确认]）：**ECharts 自带的 `roam: true`
和项目自己手写的 pinch 缩放代码同时响应触摸手势，两套逻辑叠加导致缩放速度
实际上翻倍以上**。修复是把 `roam: true` 改成 `roam: 'move'`（只保留 ECharts
自带的拖拽平移处理，完全禁用其自带缩放），缩放完全交给手写逻辑控制。

在确认这个根因之后，还经历了反复的感度系数调试（用户实测反馈"还是太快"/
"完全感受不到变化"/"很慢甚至卡顿"，多轮来回调整），过程中还发现了第二个
独立问题：早期方案用 `chart.setOption()` 每帧写入绝对 zoom 值，开销较大
导致卡顿；改为更轻量的 `dispatchAction({type:'geoRoam'})` 增量方式后解决。

**当前代码（`MapView.tsx`）的实现**已经是这次调试之后的最终版本：pinch
缩放走 CSS transform（不触发 ECharts 重绘，松手时才一次性同步，见上方
"地图性能优化记录"第3条），滚轮缩放走 `WHEEL_STEP=0.15` 的固定步长。
**这是已经定稿、用户确认满意的实现，不要在没有新反馈的情况下假设它还存在
速度不一致问题去重新调整参数。**

**问题4：台湾地图缺失** [已修复，2026-06-20 复查确认]

历史排查（`conversation_search` 找到）：最初台湾在全国视图（`china-cities.json`）
确实是22个独立县市色块，但**点击下钻进入台湾省级视图**用的是另一份独立文件
`public/geojson/710000.json`，那份是阿里DataV原始数据，只有一个未拆分的整体
轮廓（"市级地图只有一个大块"）。修复方式是直接用22县市拆分数据（来自g0v.tw
开源地理数据源，经simplify压缩）覆盖 `710000.json`。

2026-06-20 复查确认当前状态：
- `china-cities.json` 含台湾22个独立县市 feature（adcode 710001-710022）
- `710000.json`（省级下钻用）同样是22个独立县市 feature，不是旧的整块数据
- `china-provinces-outline.json` 含完整的台湾省轮廓（adcode 710000，1个feature）
- `src/data/cities.ts` 含22条台湾城市记录，与地图数据对应

**当前没有发现台湾地图缺失的问题。** 如果以后又有类似反馈，先确认精确的
复现场景（全国视图？省级下钻视图？点亮逻辑？具体哪个县市？），不要直接
假设是同一个历史问题重现——参照本节最上方"给后续协作者的重要提醒"里的方法论。

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

## 待办事项（2026-06-20 起）

记录已确认要做、但当次会话没有处理完的事项，避免遗漏或被后续协作者重复
排查同一个已经讨论过的问题。

### UI一致性问题（用户2026-06-20反馈，部分已处理）

用户一次性反馈了多条零散的视觉体验问题，复核后归为三类，处理状态如下：

**已处理**：
- 统计面板边框看起来"隐隐发红"：实为 `--shadow-card`/`--shadow-glow` 阴影
  残留旧主色RGB硬编码，未跟随主色调整联动修复，已同步改为新主色RGB。
- 地图悬停预览色硬编码`#FFD166`不跟随主题：已改为复用`--color-warning`变量，
  三主题各自定义专属值（详见设计系统文档4.1节）。

**新增已处理（2026-06-20）**：
- 地图"点亮城市"标签颜色：原固定深红`#8C2540`/浅紫`#B7A2AA`，已改为函数
  `getLitLabelColor()`/`getUnlitLabelColor()`（src/utils/colors.ts），
  分别复用 `--color-primary`（已点亮）和 `--color-on-surface-variant`
  （未点亮），不新造颜色。注：最初出过两版基于主色衍生深浅变体的效果图，
  用户最终选择"已点亮就用纯主色，未点亮用第一版的灰色调"这个更简单的方案，
  不是衍生变体——这个反复过程提示：以后遇到类似"调整XX颜色"的需求，应该
  先确认用户是想要"全新设计的颜色"还是"复用现有变量"，这两种诉求做出来的
  效果图方向完全不同，问清楚能减少来回调整的轮次。

**新增已处理（2026-06-20）**：
- 顶部导航栏Logo新增图标(🗺️)+slogan("记录你走过的每一座城")。过程中发现
  登录页的"brand-mark"用的是emoji而不是项目其他地方统一使用的SVG图标
  （之前一次CHANGELOG记录过"图标系统统一：20处emoji/文字符号替换为SVG"，
  这处是当时的漏网之鱼）。用户明确要求"两处都用emoji保持一致"，不趁机
  补做SVG化——这是合理的范围控制：用户要解决的是"Logo缺图标/slogan"，
  不是"统一登录页图标系统"，不应该擅自扩大改动范围。文案过程中还发现
  登录页原文是"记录你走过的每一座城"（不带"市"字），与用户最初选定的
  slogan候选"...每一座城市"不完全一致，确认是笔误，统一为不带"市"字的
  版本，三处（登录页两处+顶部导航栏）保持一致。

**已处理（2026-06-20，用户做完设计判断后落地）**：
- "管理员"入口与"退出"按钮视觉语言不统一：改造成账号下拉菜单（`TopBar.tsx`
  的`.account-menu`/`.account-trigger`/`.account-dropdown`），用户名点击展开，
  菜单内"个人资料""退出登录"两项统一无边框风格，退出登录用`--color-error`
  文字色区分而非边框。新增`Icon.tsx`的`logout`图标（项目已有的SVG图标系统里
  补的标准登出符号，不是新引入风格）。原`.user-trigger`/`.user-switcher`类已
  删除，确认过`.user-dropdown`（另一个"切换用户列表"场景在用的类名）未受影响，
  是两套独立的下拉样式。
- 统计面板标题sticky：桌面端`.stats-panel`原本完全没有`max-height`/`overflow`
  （移动端早就有`max-height: 42vh; overflow: auto`，是桌面端漏配），内容多时
  面板会被撑高甚至超出视口，不是简单加`position: sticky`能解决的，根因是缺
  一层滚动容器。修复：桌面端补上`max-height: min(640px, calc(100vh -
  var(--topbar-height) - var(--space-9)))` + `overflow: auto`，标题用
  `position: sticky` + 负margin手法贴住滚动容器顶部（而非贴在有padding的
  外层，否则顶部会露出空隙）。**用了`--stats-panel-pad-x`/`--stats-panel-pad-y`
  两个局部变量统一桌面端与移动端的padding值**——因为两个断点的padding本身
  不一样（桌面`--space-3-5`，移动端`--space-2-5`/`--space-3`左右不对称），
  sticky标题的负margin/padding如果硬编码某一断点的值，会在另一断点跟实际
  padding错位，露出缝隙或遮挡不全。只对`.stats-panel`的**直接子元素**
  `.panel-title`生效（用`>`子选择器），不影响面板中部"排行"小标题（同一
  class名但语义不同，不应该sticky）。
- ~~管理员面板"个人信息/访问记录/系统管理/系统设置"四个tab内容结构、内容量
  完全不同，没有统一的容器最小高度，切换tab时页面高度跳动~~
  **[已处理 2026-06-20]** `.modal-xl` 加了 `min-height: 560px`（移动端
  `min(560px, 80vh)`），560px是估算值，未在真实渲染环境量过精确高度，
  需要用户实测确认是否真的不再跳动、以及这个高度本身是否合适（太高显得
  空荡 / 太矮还是不够）。
- ~~`.data-table th`(表头,12px) 字号小于 `.data-table td`(内容,14px)~~
  **[已处理 2026-06-20]** 表头改为13px(`--font-sm`，与页签同字号)+700字重，
  需要用户实测确认协调度。
- ~~管理员面板"导出当前视图"用`.btn-primary`(实心)，"导入数据"用
  `.btn-outline`(描边)~~ **[已处理 2026-06-20]** 复核后发现这一行实际是
  四个按钮（查询/导出当前视图=实心，导入数据/下载模板=描边），不是只有
  导出导入两个。用户确认设计判断：导出/导入/下载模板本质上是同类的
  "数据搬运辅助工具"，不该因为方向不同（出/进）就主次有别；"查询"才是
  这组操作里真正驱动页面状态变化的主操作。改动：`downloadCurrentLedger`
  按钮从`btn-primary`改为`btn-outline`，"查询"仍保持`btn-primary`不变，
  不需要打破项目"主操作/次操作"的按钮规范本身。
- ~~管理员面板"用户管理"和"数据管理"两个tab切换时，整个面板宽度发生变化~~
  **[已处理 2026-06-20]** 根因不是"两个tab内容宽度不同"这么简单——
  `.data-table`设了`min-width: 720px`，这个固有最小宽度通过`.modal`→
  `.stack`→`.embedded-panel`三层**全部是`display: grid`且都未设置
  `min-width: 0`**的容器一路向上传导，最终撑大了`.modal-xl`本身（固定
  `width: min(1180px, 100%)`本该是不变的，但grid item默认`min-width: auto`
  会被内容固有宽度突破这个声明）。不是`.table-wrap`的`overflow: auto`没
  生效，是传导链在它生效之前就已经把外层撑大了。修复：在`.modal`、
  `.stack`、`.embedded-panel`三层都补上`min-width: 0`切断传导，让
  `.table-wrap`的内部横向滚动真正发挥作用，外层弹窗宽度不再受表格内容
  影响。**这类"容器被内容意外撑大"的问题如果以后再出现，优先检查链路上
  每一层grid/flex容器是否漏设`min-width: 0`（或flex item漏设`min-width: 0`/
  `flex-shrink`），而不是只看最内层有没有`overflow: auto`——`overflow`生效
  的前提是容器尺寸已经定下来，如果容器本身先被撑大了，overflow无法挽回。**
