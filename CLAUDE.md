# 项目约定

## 标准组件库

`src/components/ui/` 在这个项目里是一个**符号链接**，指向服务器级共享目录
`/root/.openclaw/workspace/shared-ui-components/react/src`——这是这台服务器上
所有项目共用的标准基础交互组件库，不属于本项目，改动会影响所有引用它的项目。

**任何改动这个项目代码的人（包括 AI 助手）在用到日期选择、下拉框等基础交互控件之前，必须先看 `src/components/ui/README.md`**（实际是共享目录里的 README），确认是否已有标准实现：
- 已有 → 直接引用，禁止重新手写一遍。
- 没有，且确实是会被多个项目复用的基础控件 → 加进共享目录（不是本项目的 `ui/` 文件夹本身，因为那只是软链接），并更新共享目录的 README。
- 只在本项目内复用、跟其他项目无关的业务组件 → 正常放在 `src/components/` 下，不要往共享目录里塞。

这条规则的目的：用户只需要说"用标准样式的组件"，不需要每次重新描述具体交互细节，
协作者（人或 AI）就该知道去共享目录找现成实现，且新项目天然就能复用，不用重新搭建。

详见共享库自己的说明：`/root/.openclaw/workspace/shared-ui-components/README.md`

## 部署流程

```
cd /root/.openclaw/workspace/city-footprint-map
npx tsc --noEmit          # 类型检查
npm run build             # 构建
rsync -a --delete dist/ /var/www/cityprint/   # 部署
```

线上地址：https://www.gnakij.top/cityprint/
后端服务：`cityprint-api.service`（127.0.0.1:8001）
