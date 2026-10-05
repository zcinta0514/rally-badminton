# R-1.9.0 发布检查点

2026-10-05，用户确认1.9.0并授权合并／打标签。本批继承AI-1、ENTRY-1、BAL-1五个候选提交，发布准备提交dcf0a4c；不包含P1人物实验，原工作区与3040预览未改。

## 发布结果

- PR [#2](https://github.com/zcinta0514/rally-badminton/pull/2)合并main提交62051d0406d7da18ed5920e15b3caf2b708458bb；annotated标签v1.9.0（97a69c5a）指向该合并提交。
- main的Tests and build与Deploy browser game to GitHub Pages工作流均成功，Vercel生产状态success。
- package、lockfile、首页正式版1.9.0一致；README、运行指南、玩家更新公告已更新。新公告ID2026-10-05-coaches-stamina-entry。
- Pages构建633bc77d0521649d，Vercel构建bc91ba3fa312a101，均85份资源。两处实际资源及worker逐字节匹配同一源码生成的发布包。

## 验证

Node22与24完整回归各691/691；两路径构建通过。发布候选Chromium实际PeerJS双端检查角色、父子局提示、双方确认、3秒倒数及发球通过。继承1053场体力模拟全部结束，数值及局限见BAL-1检查点，不当作真人平衡验收。

线上Pages／Vercel各Chromium及WebKit四组实际访问：首页1.9.0、三个入口、人机准备页选择力量陪练、实际开打双方体力条、五项音量设置、无灯效项，页面错误及4xx为0。新上下文阻止SW，仅核验当前线上构建；旧离线标签更新与实体手机未冒称通过。完整证据见 [机器QA](RELEASE-1.9.0-QA.json)。

Safari自动化直连在修改前基线同样握手超时，仍未标为通过；Safari真机直连、手机性能和三打法实战由用户自行验收。用户本轮已授权发布，不把尚未记录的真机结果另立为阻止本批上线的门槛。

## 使用与回退

正式入口：https://zcinta0514.github.io/rally-badminton/ 与 https://kaipai-rally.vercel.app/。双端联网更新后重新建房；旧正式规则3与新规则7不能混局。旧标签或主屏幕窗口可能继续缓存旧资源，应结束对局并关闭全部游戏窗口，再联网打开。

若需回退，从最新main创建修复分支，执行 `git revert -m 1 62051d0406d7da18ed5920e15b3caf2b708458bb`，经检查合并后等待自动部署。回退不改本机身份及战绩存储结构，双方仍需刷新再建房。原功能候选分支与3053预览保留；3055为发布版本地快照。
