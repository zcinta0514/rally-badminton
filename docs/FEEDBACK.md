# 玩家反馈与私人列表

本功能包含玩家表单、Node 接收接口、持久 JSON 存储和私人管理页面。静态网站本身不能保存反馈。只有明确配置接收服务后才显示“提交反馈”；未配置时显示“保存草稿”，不会伪装提交成功。

## 本地运行

需要 Node.js 22 或以上版本和现有项目依赖。以下 PowerShell 设置只影响当前终端进程；令牌应由密码管理器生成并保存，至少 32 个字符，不要写进源码或提交到 Git。

```powershell
$env:FEEDBACK_ENABLED = '1'
$env:FEEDBACK_ADMIN_TOKEN = Read-Host '输入至少 32 字符的私人管理令牌'
$env:PORT = '3000'
npm start
```

本机打开 `http://127.0.0.1:3000`，从首页“意见反馈”提交；打开 `http://127.0.0.1:3000/feedback-admin/`，输入同一令牌登录。成功记录保存在 `data/feedback.json`。管理页面支持状态与问题类型筛选、完整详情、保存“待处理／处理中／已处理”。后台壳可以公开加载，列表与修改接口始终需要 Bearer 鉴权。

令牌只保存在管理页面内存中，不写 localStorage、sessionStorage、URL、公开构建或数据文件。刷新、退出或离开管理页面后要重新登录。建议使用独立的管理页面标签；公共设备使用后退出。

更换令牌：更新服务端 `FEEDBACK_ADMIN_TOKEN` 并重启 Node。先重启服务再用新令牌登录；旧令牌立即失效。

## 正式服务配置

| 环境变量 | 用途 |
| --- | --- |
| `FEEDBACK_ENABLED=1` | 显式启用本 Node 服务接收和管理反馈；默认关闭 |
| `FEEDBACK_ADMIN_TOKEN` | 至少 32 字符的随机私人令牌；仅服务端使用 |
| `FEEDBACK_PATH` | 数据文件绝对路径；默认项目 `data/feedback.json` |
| `FEEDBACK_ALLOWED_ORIGINS` | 允许提交的游戏网站来源，逗号分隔，例如 `https://game.example`；不能包含路径、通配符 |
| `FEEDBACK_ADMIN_ORIGIN` | 反向代理后的管理网站来源，例如 `https://feedback.example`；直连 Node HTTPS 时可省略 |
| `PUBLIC_FEEDBACK_URL` | 公开接收地址，例如 `https://feedback.example/api/feedback`；本 Node 开启反馈时默认 `/api/feedback` |

独立接收服务可以运行同一项目的 Node 入口。需要持续在线主机、可写且持久的磁盘、HTTPS，以及进程重启机制。当前实现为**单 Node 进程写一个数据文件**；不要启动多副本共同写同一文件。容器部署必须将 `FEEDBACK_PATH` 指向持久卷，不能只使用容器临时层。

如果游戏继续放在静态站点：

1. 在独立主机运行本服务，配置私人令牌、持久目录和 `FEEDBACK_ALLOWED_ORIGINS` 为游戏实际来源。
2. 将服务通过 HTTPS 对外提供。可使用已有 TLS_KEY_PATH / TLS_CERT_PATH 配置，也可在前面放可信反向代理。反向代理模式设置 `FEEDBACK_ADMIN_ORIGIN` 为管理页面的实际 HTTPS 来源；不信任任意客户端的 X-Forwarded-* 头。
3. 静态构建时设置 `PUBLIC_FEEDBACK_URL=https://feedback.example/api/feedback`，重建并发布。此公开地址不含令牌、用户名密码、查询参数或片段。
4. 作者访问接收服务的 `/feedback-admin/` 管理反馈。静态游戏站点无需接收或保存令牌。
5. 用真实发布的游戏提交一条测试建议，确认后台出现；修改状态并重启服务，确认记录和状态仍在。之后才能宣称线上反馈已接通。

本次开发不包含主机购买、账户注册或公网部署。未配置线上地址的静态发布仍只能保存本机草稿。

Node 启动时生成静态资源快照。修改代码、环境变量或公开接收地址后，需要重启 Node；核验浏览器已加载新版本，不能仅凭服务重启判断旧 PWA 已更新。

## 数据与限制

- 玩家无需注册，内容必填，联系方式选填。类别为操作手感、联机、画面性能、功能建议、其他。
- 表单只附带公开构建版本、平台短名称、玩法短名称。代码白名单拒绝玩家密钥、房间码、邀请参数、昵称等额外字段。联系方式及玩家主动填写的内容仅作者可见。
- 反馈正文最多 4000 字符、联系方式最多 200 字符，单请求 16 KiB。服务端拒绝未知类别、状态和字段。
- 每个连接来源 IP 每 10 分钟最多 20 次提交，每分钟最多 10 次失败登录。限速状态仅存于内存，不保存 IP 到反馈文件。反向代理后多位玩家可能共享同一连接来源限额；需要规模化时应在可信入口增加限速和身份化的配额机制。
- 存储最多 10000 条，达到上限返回未保存提示。首版无删除入口，需由管理员离线备份后维护文件。文件格式为 `{ "schema": 1, "items": [...] }`。
- 单进程队列串行处理写入，临时文件写入并同步后原子重命名；只有完成保存才返回成功。数据文件损坏时拒绝启动，不会静默覆盖为一个空列表。
- 关闭页面前的失败草稿保留在该浏览器的 localStorage。草稿可能含选填联系方式；清除网站数据会丢失草稿。存储不可用时界面明确提示请保持页面打开或复制内容。
- 重试沿用原提交 ID 与原公开上下文；服务端去重。修改草稿会生成新 ID。更换浏览器、清除数据或手动重新录入视为新反馈。
- 后台 HTML、JS、CSS 和全部反馈 API 均返回 `Cache-Control: no-store`。管理界面使用文本节点显示内容，不渲染玩家提交的 HTML。

## HTTP 接口

### `POST /api/feedback`

`Content-Type: application/json`。跨站浏览器请求必须来自配置来源。

```json
{
  "id": "76baac34-d3f1-4c02-a37e-454ddbf0fca1",
  "category": "controls",
  "content": "杀球时希望落点提示更清晰。",
  "contact": "",
  "context": { "version": "build-id", "platform": "Android", "mode": "人机练习" }
}
```

创建返回 `201 {"ok":true,"id":"…","duplicate":false}`；相同 ID 相同内容重试返回 `200` 和 `duplicate:true`，不会追加第二条。ID 相同但内容变化返回 409。关闭服务返回 503；验证失败 400；正文过大 413；Content-Type 错误 415；限速 429 并带 Retry-After；磁盘写入失败 503。所有失败均不能当作已提交。

### `GET /api/feedback?status=pending&category=controls`

必须有 `Authorization: Bearer <私人令牌>`。筛选参数可省略。返回 `{items:[...]}`，新反馈在前，每条包含 `status`、`createdAt`、`updatedAt` 和原提交字段。未鉴权返回 401，非法跨站来源返回 403。

### `PATCH /api/feedback/:id`

同样必须 Bearer 鉴权和 JSON 请求，正文例如 `{"status":"processing"}`。状态只允许 `pending`、`processing`、`resolved`。保存完成返回 `{item:{...}}`，不存在返回 404。

## 验证命令

```powershell
node --test tests/feedback.test.js tests/feedback-client.test.js
```

覆盖权限、来源白名单、反向代理来源、服务关闭、字段限制、幂等和并发重试、磁盘失败、重启持久化、限速、客户端失败草稿、接收确认与地址验证。
