

### 待办进度更新（"系统管理页签变高"问题的处理方式变更）

**已处理（设计方案变更，不是简单修bug）**：
用户没有继续在"修复tab切换高度跳变"这个方向上走（之前用`.modal-xl min-height:
560px`硬凑值，效果不稳定），而是改变设计：把"系统管理"整体从"个人信息/访问
记录/系统管理/系统设置"这个共享tab容器里拿出来，挪到TopBar账号下拉菜单
（"个人资料"和"退出登录"之间），点击后打开AdminPanel的**独立弹窗**（不再是
embedded嵌入模式）。这样从根上避免了"管理面板内容结构、内容量跟其他tab差异
巨大导致共享容器尺寸跳变"的问题，而不是继续在共享容器内部凑高度值。

具体改动：
- `UserProfile.tsx`：tabs数组及类型`ProfileTab`去掉`'admin'`，删除`tab===
  'admin'`渲染分支，删除`AdminPanel`的lazy import（不再在这个文件使用）。
- `useStore.ts`：`ProfileTab`类型（这是一个跟UserProfile.tsx里同名但独立
  定义的类型，注意以后改动要同步两处）同步去掉`'admin'`。
- `TopBar.tsx`：下拉菜单"个人资料"和"退出登录"之间新增"系统管理"入口，
  仅`currentUser?.is_admin`为真时显示，onClick调用`setAdminOpen(true)`。
- `App.tsx`：新增`{adminOpen && <AdminPanel />}`挂载（非embedded独立弹窗
  模式）。**重要发现**：`adminOpen`这个store状态此前已经存在（管理员登录/
  创建管理员时会被设为true），`AdminPanel`组件内部也早就写好了非-embedded
  模式的独立弹窗渲染分支（`modal-backdrop`+标题"管理员面板"），但App.tsx
  从未挂载消费这个状态——是一段长期存在的"半成品"死代码，这次顺便补全。
- `useStore.ts`：管理员登录/创建管理员时不再自动设置`adminOpen: true`
  （用户明确要求登录后应进入主地图页，"系统管理"只能通过下拉菜单手动打开，
  之前这两处自动弹出的旧逻辑因为没有渲染入口从未真正生效过，现在补上挂载点
  后会突然生效，已按用户要求关闭）。
- `Icon.tsx`：新增`settings`（齿轮）图标，沿用项目"图标系统统一"约定补充
  进SVG图标体系，不直接用emoji（此前没有语义贴切的现成图标）。

**附带效果**：UserProfile不再嵌入AdminPanel，两个组件的代码分割chunk彻底
拆开，`UserProfile`的产物体积从约442KB降到约15KB（AdminPanel本身仍按需
懒加载，总体积没有增加，只是不再被两个入口共享同一个chunk）。

**已验证**：`npx tsc --noEmit`通过，`npm run build`通过，已部署。
