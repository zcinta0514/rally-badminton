# RELEASE-FX v1.8.0 发布检查点

2026-10-04 在独立 worktree `.cindy-worktrees/fx-production`（分支 `release/FX-production`）整理并发布本批更新。
基线为联网核验的正式 main `d15ff7c`（v1.7.1）；Draft PR [#1](https://github.com/zcinta0514/rally-badminton/pull/1) 的 Node 22／24 CI 均通过。

发布结果（2026-10-04 已核验）：PR #1 合并为 `main` 提交 `45a5d86`，标签 `v1.8.0` 指向该提交；GitHub Actions「Tests and build」与「Deploy browser game to GitHub Pages」均成功，Vercel 生产部署完成。线上核验：Pages 实际构建号 `0482fefd67cdc881`、Vercel `4c377c8c35725c4c`，两处首页均显示「正式版 1.8.0」；Chromium／WebKit 实际访问两个线上入口完成开打、体力条、设置项与无报错检查（见 `artifacts/release-prep/live-qa.json`）。

## 发布范围

- FX-1：体力只在回合中恢复，双方脚下显示体力条。
- FX-1B：均衡、灵巧、力量三种打法的消耗／恢复差异与疲劳对移动、击球稳定性的影响；模拟报告见 `scripts/check-stamina-balance.mjs`。
- FX-2：录制击球／脚步／掌声／欢呼变体与空间混音、观众分级反应。
- FX-3：局内音量设置、只读本场规则摘要、局点／赛点提示。
- FX-3B：整体场馆基础照明。
- FX-3C：移除精彩分／局胜／赛胜闪动、彩色光池与灯效设置，保留稳定基础照明与音量设置。

发布**不包含**：V4 人物与动作实验（`motionProfile: 'v4'`、`shared/v4-motion.js`、`athlete-v4-court-preview.js`、球网演示预览、`shared/net-physics.js`）、未验收 P1 资产与入口、已取消的庆祝灯效。

## 已核验证据（1.8.0 版本号确定后重跑）

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 全量回归（Node v24.21.0） | 672 项通过，0 失败 | `artifacts/release-prep/release-tests.log` |
| 全量回归（Node 22，CI/Vercel 版本） | 672 项通过，0 失败 | `artifacts/release-prep/release-tests-node22.log` |
| 版本一致性 | `package.json`／`package-lock.json`／首页「正式版 1.8.0」一致 | `tests/release-version.test.js` |
| 根路径／Vercel 构建（`PUBLIC_BASE_PATH=/`） | PWA `4c377c8c35725c4c` | `artifacts/release-prep/release-build-root.log` |
| GitHub Pages 子路径构建（`/rally-badminton/`） | PWA `0482fefd67cdc881` | `artifacts/release-prep/release-build-pages.log` |
| 实际服务资源比对 | 85 个资源逐一哈希一致，`/src/arena-lighting.js` 返回 404 | `artifacts/release-prep/service-qa.json` |
| 浏览器验收（Chromium、WebKit） | 两侧镜位 × 普通分／精彩分／局胜／赛胜共 16 个用例；照明始终为半球光＋两盏平行光共 3 盏，无闪动与彩色光池；设置仍有 5 个音量项、无灯效项；无页面报错 | `artifacts/release-prep/browser-qa.json`、`*-steady-court.png`、`*-settings-portrait.png` |
| 静态部署验收 | Pages 子路径（Chromium／WebKit）与根路径（Chromium）：构建号一致、basePath 与 Service Worker scope 正确、无 4xx、无页面报错、体力条正常 | `artifacts/release-prep/static-deploy-qa.json`、`*-static.png` |
| 经典体力一致性 | `shared/stamina.js` 与已验收 FX-3C 分支 `5dca40b` 逐字节一致；`shared/game.js` 相对该分支的全部差异都只存在于 `motionProfile === 'v4'` 分支内，经典玩法行为未改 | 本检查点记录 |

自版本号递增后未再修改任何游戏源码或资源；上表对应当前发布内容（远端 CI 与部署会以 main 上的实际提交重跑一次）。

## 仍需用户确认的项目

1. iPhone 13／Safari 与 Pixel 8／Chrome 实体机 30 分钟、稳定 60 帧实测（用户自行完成）。
2. 三打法实战平衡与玩法／视听验收。
3. 专用真实音效素材仍有缺口；本版只发布已核验的录音变体与混音功能。

## 验收方式

- 线上正式站：`https://zcinta0514.github.io/rally-badminton/` 与 `https://kaipai-rally.vercel.app/`。
- 本机预览：`http://127.0.0.1:3046/`；同一 Wi-Fi 的手机：`http://192.168.1.103:3046/`（横屏）。

## 发布动作（已执行）

1. 版本号：`package.json`、`package-lock.json`、首页「正式版」与本说明同步为 1.8.0。
2. 合并：PR #1 → `main` 合并提交 `45a5d86`；GitHub Actions Pages 与 Vercel 生产自动部署成功。
3. 标签：`v1.8.0` 由 annotated tag `2b60f5a` 指向 `45a5d86`。
4. 线上核验：Pages `0482fefd67cdc881`、Vercel `4c377c8c35725c4c`，均显示「正式版 1.8.0」。

## 回退步骤

1. 合并前回退：关闭 PR #1，不影响 main 与线上。
2. 合并后回退：在 main 上 `git revert -m 1 <发布合并提交>`（或 revert 该功能提交）并推送，GitHub Actions Pages 与 Vercel 会按 main 自动重建上一状态；也可用标签 `v1.7.1` 对应提交重新部署。
3. 客户端数据：本批新增的 `rally.arena.v1` 仅保存音量与设置，回退后的旧代码不读取该键，昵称与本机战绩不受影响；协议 3 拒绝旧客户端混用，回退后双方都需刷新页面再重新建房。
