

### "系统设置"改名"主题选择"并移出个人资料弹窗（2026-06-20）

跟"系统管理"同样的设计变更思路：用户要求把原"系统设置"tab（个人资料弹窗里
四个tab之一，内容只有一个主题下拉框）改名"主题选择"，移到TopBar账号下拉菜单
"个人资料"和"系统管理"之间。

**交互形式的取舍**：不用独立弹窗（用户明确说"内容非常简单，不该用弹窗"），
也不是简单下拉框替换——用户提到"未来还想多做几个主题"，所以采用账号下拉
菜单内原地展开的二级列表：点击"主题选择"这一行不关闭外层账号菜单，原地
展开/收起 Linear/Stripe/Rose 选项列表，点哪个直接切换。这样以后加主题只需要
往`TopBar.tsx`的`THEME_OPTIONS`数组加一项，不需要改变整体交互形式。

具体改动：
- `TopBar.tsx`：新增`THEME_OPTIONS`常量、`themeMenuOpen`本地状态；"主题选择"
  按钮点击切换二级列表展开/收起；二级列表里每个主题选项点击后直接调用
  `updateSettings`切换主题，当前选中项左侧显示check图标，其余用等宽spacer
  占位保持对齐。外层菜单关闭（点击外部/选个人资料/选系统管理/退出登录）时
  同步收起二级列表，避免下次打开账号菜单时二级列表状态残留。
- `Icon.tsx`：新增`palette`（调色板）图标。原计划复用`settings`图标，但
  发现会跟"系统管理"撞图标、语义也不够贴切（主题选择是色彩/外观，不是系统
  配置），改用专属的调色板图标。
- `UserProfile.tsx`/`useStore.ts`：`ProfileTab`类型（两处独立定义，需同步
  改）去掉`'settings'`，删除对应tab和渲染分支，删除不再使用的`settings`/
  `updateSettings`两个useStore订阅。
- `index.css`：新增`.account-dropdown-submenu`（左侧细线+缩进区分层级）、
  `.account-dropdown-subitem`（复用主列表项样式，字号略小）。

**顺手清理的死代码**：排查中发现`src/components/SettingsPanel.tsx`是一个
从未被`App.tsx`挂载过的独立组件，内容跟"主题选择"+访问记录tab的导出/导入/
清空数据功能完全重复（对应的`settingsOpen`/`setSettingsOpen`store状态同样
从未被消费）。用户确认这次一并删除，不留着以后处理。这是这个项目第二次
发现"组件和state都写好了，但因为历史重构遗漏了挂载点，变成死代码"的情况
（上一次是`adminOpen`/`AdminPanel`非embedded模式），**提示以后排查类似
"功能好像没生效"的问题时，要记得检查目标组件是否真的被某处挂载消费，不能
只看组件内部逻辑是否正确**。

已验证：`npx tsc --noEmit`通过，`npm run build`通过，已部署。
