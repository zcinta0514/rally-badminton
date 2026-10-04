# RELEASE-FX 发布候选检查点

2026-10-04 在独立 worktree `.cindy-worktrees/fx-production`（分支 `release/FX-production`）整理正式上线候选。
基线为联网核验的正式 main `d15ff7c`（v1.7.1）。本检查点只记录已核验的证据。

发布状态：分支已推送到 `origin/release/FX-production`，Draft PR [#1](https://github.com/zcinta0514/rally-badminton/pull/1) 开放（未合并）；远端 CI「Tests and build」的 Node 22／24 均通过。合并会触发 GitHub Pages 与 Vercel 生产自动部署，因此必须等真机与玩法／视听验收通过；版本号在验收通过、范围冻结后按 1.8.0 递增（本批为较大功能与体验更新）。

## 发布范围（候选包含）

- FX-1：体力只在回合中恢复，双方脚下显示体力条。
- FX-1B：均衡、灵巧、力量三种打法的消耗／恢复差异与疲劳对移动、击球稳定性的影响；模拟报告见 `scripts/check-stamina-balance.mjs`。
- FX-2：录制击球／脚步／掌声／欢呼变体与空间混音、观众分级反应。
- FX-3：局内音量设置、只读本场规则摘要、局点／赛点提示。
- FX-3B：整体场馆基础照明。
- FX-3C：移除精彩分／局胜／赛胜闪动、彩色光池与灯效设置，保留稳定基础照明与音量设置。

候选**不包含**：V4 人物与动作实验（`motionProfile: 'v4'`、`shared/v4-motion.js`、`athlete-v4-court-preview.js`、球网演示预览、`shared/net-physics.js`）、未验收 P1 资产与入口、已取消的庆祝灯效。

## 已核验证据

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 全量回归（Node v24.21.0） | 672 项通过，0 失败 | `artifacts/release-prep/final-tests.log` |
| 全量回归（Node 22，CI/Vercel 版本） | 672 项通过，0 失败 | `artifacts/release-prep/node22-tests-final.log` |
| 根路径／Vercel 构建（`PUBLIC_BASE_PATH=/`） | PWA `3812dcf037d98243` | `artifacts/release-prep/build-vercel.log` |
| GitHub Pages 子路径构建（`/rally-badminton/`） | PWA `cf475e4c6e77d3e7` | `artifacts/release-prep/build-pages.log` |
| 实际服务资源比对 | 85 个资源逐一哈希一致，`/src/arena-lighting.js` 返回 404 | `artifacts/release-prep/service-qa.json` |
| 浏览器验收（Chromium、WebKit） | 两侧镜位 × 普通分／精彩分／局胜／赛胜共 16 个用例；照明始终为半球光＋两盏平行光共 3 盏，无闪动与彩色光池；设置仍有 5 个音量项、无灯效项；无页面报错 | `artifacts/release-prep/browser-qa.json`、`*-steady-court.png`、`*-settings-portrait.png` |
| 静态部署验收 | Pages 子路径（Chromium／WebKit）与根路径（Chromium）：构建号一致、basePath 与 Service Worker scope 正确、无 4xx、无页面报错、体力条正常 | `artifacts/release-prep/static-deploy-qa.json`、`*-static.png` |
| 经典体力一致性 | `shared/stamina.js` 与已验收 FX-3C 分支 `5dca40b` 逐字节一致；`shared/game.js` 相对该分支的全部差异都只存在于 `motionProfile === 'v4'` 分支内，经典玩法行为未改 | 本检查点记录 |

候选工作区在最终回归与浏览器验收之后未再修改源码，测试与验收对应当前文件内容。

## 尚未完成的上线门槛

1. iPhone 13／Safari 与 Pixel 8／Chrome 实体机 30 分钟、稳定 60 帧实测未做。
2. 专用真实音效素材仍有缺口；本版只发布已核验的录音变体与混音功能。
3. 三打法实战平衡与用户最终玩法／视听验收未记录。
4. 版本号未确定。按 WORKFLOW 门槛，功能验收通过、发布范围冻结后，按最新已发布版本与本批实际改动确定；本批属较大功能与体验更新，届时递增次版本位（拟 1.8.0），纯流程文档与内部工具不参与版本递增。
5. 合并 main、打标签、部署：验收通过后执行；合并会触发 GitHub Actions Pages 与 Vercel 生产自动发布。

## 验收方式

- 本机预览：`http://127.0.0.1:3046/`；同一 Wi-Fi 的手机：`http://192.168.1.103:3046/`（横屏）。
- Vercel 分支预览：`https://kaipai-rally-git-release-fx-production-zcinta0514-2158.vercel.app`（受 Vercel 部署保护，需登录 Vercel 账号）。
- 线上正式站（v1.7.1，用于对比）：`https://zcinta0514.github.io/rally-badminton/`。

## PR 说明草稿

标题：`feat: 体力、球场声音、观众反应与局内设置（发布候选）`

内容要点：候选范围与上述一致；排除未验收人物／V4 实验与已取消灯效；回归 672 项通过（Node 22 与 24）；两处部署目标构建与静态托管验收通过；好友对打协议版本提升为 3，旧客户端需刷新后才能加入新规则房间；真实手机性能与专用音效素材仍待验收。

## 回退步骤

1. 合并前回退：候选在远端分支 `release/FX-production` 与 Draft PR #1 中，关闭 PR 即可，不影响 main 与线上。
2. 合并后回退：在 main 上 `git revert -m 1 <发布合并提交>`（或 revert 该功能提交）并推送，GitHub Actions Pages 与 Vercel 会按 main 自动重建上一状态；也可用标签 `v1.7.1` 对应提交重新部署。
3. 客户端数据：本批新增的 `rally.arena.v1` 仅保存音量与设置，回退后的旧代码不读取该键，昵称与本机战绩不受影响；协议 3 拒绝旧客户端混用，回退后双方都需刷新页面再重新建房。
