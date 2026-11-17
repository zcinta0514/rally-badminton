# 安装到手机 Implementation Plan

**Goal:** 将现有 PWA 能力整理成清晰可操作的安装流程，提供独立分支预览。
**Architecture:** src/pwa.js 负责安装平台引导和状态展示；src/pwa.css 负责弹窗和入口布局。复用现有 service worker 和 update-client，不更改缓存与更新事务协议。
**Tech Stack:** JavaScript modules、Service Worker、node:test、Playwright。

- [x] 在 tests/pwa-client.test.js 添加平台引导测试：iOS 不提供程序安装；微信跳外部浏览器；Android 仅在安装事件可用时提示按钮；已安装窗口不再显示步骤。
- [x] 在 src/pwa.js 实现 getInstallGuide 并连接现有安装事件；将首页入口改为安装到手机；弹窗增加资源状态标题、独立的更新说明、重试按钮。保持已有缓存确认及对局锁定。
- [x] 在 src/pwa.css 添加安装特点、状态卡和紧凑横屏样式。版本从 1.21.10 更新为 1.21.11，记录 CHANGELOG。
- [x] 执行 npm test 和 npm run build；使用 scripts/verify-install-preview.mjs 验证四种视口、平台引导、安装提示取消和接受、真实缓存离线重开。
- [x] 创建 Draft PR，在 Codex 侧栏打开分支的实际游戏预览，报告实现与验证范围，不合并。

