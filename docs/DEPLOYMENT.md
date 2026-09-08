# 运行与部署

## 局域网

需要 Node.js 22+。执行 `npm ci` 和 `npm start`，电脑打开
`http://localhost:3000/`；同一 Wi-Fi 的手机使用终端输出的局域网地址。
路由器需要允许设备互访，系统需要允许 Node 接收该网络的 TCP 3000 连接。

## 公网好友 1V1

需要持续运行的 Node.js 服务器、域名和有效 HTTPS 证书。两位玩家连接同一个
服务器。房间存在单个进程内，不能直接启动多个互不共享状态的副本；重启会
清空房间，排行榜单独持久化。

1. 克隆仓库，运行 `npm ci --omit=dev`。
2. 复制 `deploy/rally.env.example` 为根目录 `.env`，填写域名和排行榜存储路径。
3. 为服务用户准备可写的排行榜目录；配置和玩家数据仅留在服务器。
4. 用进程管理器持续执行 `node --env-file=.env server/index.js`。
5. 按 `deploy/nginx.conf.example` 设置 Nginx，换成自己的域名和证书路径。
6. 检查 HTTPS `/health`，两台设备创建并加入房间，完成一场比赛验证入榜。

`npm start` 不会自动读取 `.env`；上述 `--env-file` 命令会读取它。

| 配置 | 用途 |
| --- | --- |
| `HOST=127.0.0.1` | Nginx 同机代理时只监听本机 |
| `PORT=3000` | Node 服务端口 |
| `ALLOWED_ORIGINS` | 完整网页来源，逗号分隔，不带结尾斜杠或通配符 |
| `ALLOW_MISSING_ORIGIN=0` | 公网保持严格来源检查 |
| `LEADERBOARD_PATH` | 持久磁盘上的榜单 JSON，默认 `data/leaderboard.json` |
| `PUBLIC_WS_URL` | 前后端分离时填写公开 `wss://比赛域名/ws`，同源留空 |

`PUBLIC_WS_URL` 是浏览器的公开连接地址，不是密钥。浏览器运行配置不能存放
秘密、内部管理地址或带凭据的网址。真实 `.env`、TLS 私钥和证书不要提交 Git，
也不要放入 `src/`、`icons/` 等浏览器可下载的目录。

## 静态网页与离线人机

执行 `npm ci` 和 `npm run build`，将 `dist/` 部署到 HTTPS 站点根目录。
静态包提供人机练习与离线缓存，好友对打和排行榜仍需常驻服务器。前后端分离时，
构建前设置 `PUBLIC_WS_URL`，把前端来源加入后端 `ALLOWED_ORIGINS`。
不能把比赛服务当成只运行一次的无服务器函数。

iPhone 在 Safari 中打开 HTTPS 网址，通过分享菜单添加到主屏幕。首次联网
等到「离线人机已就绪」再断网。新版备好后，结束比赛并关闭全部游戏标签页与
主屏幕窗口，再打开启用；不会在对局中强制刷新。

## 数据与备份

榜单需要可写的持久磁盘。部署者自行备份 `data/leaderboard.json`，不要上传
公开仓库。昵称和分数会出现在服务器公开榜单，匿名设备凭据不会公开。
当前没有跨服务器同步、注册账号或跨设备找回。
