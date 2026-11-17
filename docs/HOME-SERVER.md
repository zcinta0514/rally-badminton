# 本机联机服务器：临时入口运行说明

基于 1.21.12，服务器预览版本 1.22.0。服务器权威计算两人单打；当前服务器模式不支持四人联机双打。人机双打与原公开站点的手机直连双打不受影响。

## 当前部署方式

- 独立安装目录：`%LOCALAPPDATA%\RallyServer\app`，从本分支的已验证提交导出。开发工作区变更不会自动影响这个快照。
- 游戏只监听 `127.0.0.1:3210`，经 Cloudflare Quick Tunnel 暂时对外提供 HTTPS/WSS。没有打开桌面、磁盘目录或远程终端，也没有更改系统防火墙。
- 当前入口记录在 `%LOCALAPPDATA%\RallyServer\status.json` 的 `url`。临时隧道重启后可能换地址；已有房间会断开，旧邀请可能失效。购买域名之后还需要配置固定隧道/其他公网接入，不能仅靠购买域名自动获得国内低延迟。
- 此阶段网页资源也由本机临时入口提供，以避免将未经用户验收的服务器切换发布到已有 GitHub Pages/Vercel 主站。原站点继续原有联机方式。后续可将静态网页独立托管，WSS 指向固定服务器地址。
- 临时服务上限 10 个房间、40 个连接是保护阈值，不是已经压测认证的容量。超过连接上限返回 HTTP 503，超过房间上限显示忙碌提示。
- 51LA 仍按原生产域名白名单采集；临时域名不纳入历史 PV/UV。服务器自己的日志记录房间数、连接数、内存和累计 CPU 时间，不能替代网站统计。

## 启停与恢复

使用安装时生成的“启动开拍服务器”“停止开拍服务器”“开拍服务器状态”快捷方式。

脚本需要 PowerShell 7；不修改 Windows PowerShell 5 的执行策略。

```powershell
pwsh -NoProfile -File "$env:LOCALAPPDATA\RallyServer\app\scripts\home-server.ps1" -Action Start
pwsh -NoProfile -File "$env:LOCALAPPDATA\RallyServer\app\scripts\home-server.ps1" -Action Status
pwsh -NoProfile -File "$env:LOCALAPPDATA\RallyServer\app\scripts\home-server.ps1" -Action Stop
```

监督进程隐藏运行；节点/隧道退出后会重新启动。子进程绑定 Windows Job Object，监督进程异常退出时一并终止，避免留下无人管理的公网服务。手动 Stop 会保留停止标记，下次登录也不会自动恢复，直到执行 Start。若监督进程自身异常退出，需要 Start 或重新登录恢复。

登录启动项只在当前 Windows 用户登录后运行；不是登录前的系统服务。电脑需供电、联网并保持运行。运行期间仅阻止自动空闲休眠，不保持屏幕常亮，不改变全局电源计划；关机、显式睡眠、合盖休眠或断网仍可能中断服务。停止后解除该进程的防休眠请求。

## 数据、日志与回退

- 战绩：`%LOCALAPPDATA%\RallyServer\data\leaderboard.json`，不在公开资源目录。升级前备份整个 data 目录。
- 日志：`%LOCALAPPDATA%\RallyServer\logs`。指标约每 15 秒一条，超过 5MB 轮换并保留三份旧文件。子进程日志每 15 秒检查 10MB 软阈值，超过后受控重启并轮换（会断开比赛，临时地址可能变化）；并非逐字节硬上限。
- 状态 `running` 表示本机健康检查和隧道就绪检查通过，不证明玩家所在地网络稳定。需要不同运营商的真机验收。
- 回退：先 Stop，确认本地 `/health` 不再响应。原 GitHub Pages/Vercel 无需回滚，因为没有改变它们。删除登录启动项可取消登录自动启动；不会删除战绩。

## 验证范围

875 项自动测试通过；独立浏览器上下文在 844×375 和 667×375 横屏完成建房、邀请加入、准备、比赛状态同步、暂停与退出。本机端点和临时公网端点均通过；公网验证仍使用同一台电脑发起，不能声称已完成两部手机跨运营商验收。临时通道经过境外节点，观察到约 744ms 显示延迟，不适合据此承诺流畅竞技体验。
