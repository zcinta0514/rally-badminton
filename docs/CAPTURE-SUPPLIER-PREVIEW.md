# P1-3 供应方技术证据与公开小样预审

2026-10-03。本轮为公开资料审查，未联系供应方、委托实拍或取得产品使用权。证据原件位于 `artifacts/capture-prep/20261003-supplier-review/`；机器索引含 URL、文件、SHA256、下载结果和证据边界。本文是本次审查报告；实时进度只维护在 [PROJECT-STATUS](PROJECT-STATUS.md)。

## 结论与选型建议

1. **青瞳可优先进入专项集成方案询证，尚不能选定。** 官方羽毛球案例具有直接领域相关性，但历史案例使用 MC1300，当前产品表的最高频率为 210 fps，不能照搬为本项目 500–1000 Hz 身体采集候选方案。需说明历史设备版本、升级配置、实际视野及独立动态误差。频率不匹配是方案差距，不等于已经测出其动作质量失败。
2. **全场身体链比较 Qualisys Arqus A12 高速模式与 Vicon VK8／VK6。** 这些具体模式有官方原文依据，仍须用拟用场地、小标记、真实速度、遮挡和双方运动试采；不凭品牌或静态标称精度定胜负。青瞳升级链也可按同一标准参评。
3. **局部高速链以 Phantom TMX7510 为有文件依据的候选。** 全分辨率 76,000 fps 有官方支持，可在初始 10k–20k fps 外增加 50k／76k 对照，以最终可辨性和总误差决定模式。更高帧率不能替代照明、曝光、标定与时钟证据。Photron 仍待完整模式资料。
4. **公开小样不足以进行羽毛球实拍验收。** 本轮保存的两段 MP4、一段 GIF 和案例 JPEG，在抽取画面中呈现软件骨架／分析界面，没有可用的羽毛球运动员原始多机实拍证据。结论为 `needs_evidence`，运动质量为 `not_assessed`，不是供应方质量不合格，也不是通过。
5. **不得假定全分辨率高速视频可以连续记录完整回合。** RAM、分段触发、再武装死区和卸载速率必须纳入试采。全场身体／参考视频持续记录；局部高速按预先选定事件覆盖，并证明事件间不存在漏采。

## 官方技术证据

下表“支持”指官方文档载明的能力，不代表本项目现场实测。数值条件不能跨型号、模式或用途拼接。完整来源和指纹见 [证据索引](../artifacts/capture-prep/20261003-supplier-review/evidence-registry.json)。

| 证据 ID／来源 | 已取得的依据 | 对本项目的边界／补件 |
| --- | --- | --- |
| CM-CASE：[上海体育大学案例](https://en.chingmu.com/case/10576.html)，页面日期 2026-04-24 | 原文 “simultaneously tracks athletes, rackets, and shuttlecock trajectories”；单／双人、实时／离线分析 | 没有设备模式、同步残差、局部触球精度、原始数据或商业委托承诺；不能据此认定场地可用 |
| CM-NEWS：[专项介绍](https://en.chingmu.com/news/720.html)，页面日期 2024-11-21 | 羽毛球小节明确 “using the MC1300 motion capture system” | 相邻乒乓球小节的 23 关节和力台描述不能自动转移到羽毛球案例；网页日期不是不可变版本证明 |
| CM-MC：[MC 参数表](https://en.chingmu.com/product/10497.html) | MC1300：1280×1024、最高 210 fps、Network 同步；标称 3D Precision ±0.08–0.12 mm | 标称精度缺少本场地动态独立验证；支持 Optical Finger 不等于遮挡手指可测。要求升级链而非照搬历史配置 |
| CM-K：[K 参数表](https://en.chingmu.com/product/10100.html) | 顶部称区域采集最高 1000 fps；表中 K5／K9 为 360 fps，K18 为 172 fps，K26 为 180 fps | 不能把 26 MP 与 1000 fps 当成同时成立的模式。提交窗口大小、ROI／视野、镜头、实测标记像素与遮挡覆盖 |
| CM-SPORT：[运动科学页](https://en.chingmu.com/photo/10145.html) | “Microsecond-level synchronization”；描述力台、肌电、足底压力及高速相机集成 | 微秒级是厂商声明，尚无脉冲日志、残差分布、漂移或丢帧证据 |
| Q-A：[Arqus 官方表](https://docs.qualisys.com/qtm/content/techref/arqus_model_specs.htm) | A12 正常 12 MP／300 Hz，高速全视野 2048×1536／1040 Hz；A5 正常 5 MP／700 Hz，高速全视野 1280×960／1400 Hz | 全视野不等于保持正常模式空间分辨率。A12 40 m 距离条件为 16 mm 标记＋标准镜头；1 m 下 Marker resolution 不是全场人体误差，camera latency 不是同步误差 |
| V-V：[Valkyrie 2025 PDF](https://www.vicon.com/wp-content/uploads/2025/07/Valkyrie-Spec-Sheet-2025.pdf)，PDF 第 2、5、6 页 | VK8：3712×2176／500 fps；VK6：2816×2176／720 fps；全局快门。更高至 2000 fps 为 partial scan，依软件与模式 | 裁窗会减小图像；主机约 30 fps 预览不代表原始采样率。第 5 页所列最大闪光时长不能当成最短曝光 |
| P-T：[TMX 官方 PDF](https://www.phantomcameras.cn/-/media/project/ameteksxa/visionresearch/documents/datasheets/web/ds_web-phantom-tmx-7510-6410-5010-rev6.pdf?download=1)，PDF 第 1–4 页 | TMX7510：1280×800／76,000 fps；全局快门、12 bit；标准最短曝光 1.04 µs；FSync／IRIG、可配置 BNC；原生 .cine。256 GB／76k 表列约 2.2 s | URL 文件名 rev6，但文内 Revision 7／May 2025，以取得文件为准。1.75M fps 需要极小 ROI 与 FAST 条件，不能冒充全分辨率；接口存在不证明跨系统同步残差 |

未采信的资料：旧青瞳 `casesclass_3/casesdetail_134.shtml` 虽 HTTP 200，正文实际为错误页。Photron NOVA S 产品页本次 HTTP 403，未据搜索摘要确认具体模式。Vicon Lock Lab PDF 已保存，但当前 PDF 解析环境缺少 AES 所需 `cryptography`，本报告不引用其正文或声称完成解读。以上文件状态均记录在索引。

## 公开媒体预审

这是公开演示材料的内容抽样审查，不是受委托试采。下载文件不含可用于独立验收的原始多机数据、校准、同步或权利包。两段 MP4 均为 H.264、1920×960、30 fps 分发文件；**30 fps 仅是文件编码帧率，不能倒推原生采集频率或动作播放速度。**

| 媒体 ID／原件 | 本次审查位置与可见内容 | 预审结果 |
| --- | --- | --- |
| CM-M1：[同步演示 MP4](https://en.chingmu.com/upload/video/4duoxitongweimiaojitongbuyugaosuyundongbozhuo.mp4)，7.833 s／235 帧 | 每 0.5 s 抽帧，0–5 s 为乒乓球双人骨架／虚拟球桌；5.5–7.5 s 为追踪界面。区间之间存在内容切换；精确切点未测。[抽帧图](../artifacts/capture-prep/20261003-supplier-review/chingmu-sync-demo-sheet.jpg) | `reference_only`；抽样不提供羽毛球原始实拍、球头接触、时钟误差或力学证据 |
| CM-M2：[专项演示 MP4](https://en.chingmu.com/upload/video/7fuzachangjingshiyingxingyuzhuanxiangyingyongkuozhan1.mp4)，3.167 s／95 帧 | 每 0.25 s 抽帧至 3 s，下肢骨架、参数与步态报告界面；无可辨羽毛球回合。[抽帧图](../artifacts/capture-prep/20261003-supplier-review/chingmu-sport-demo-sheet.jpg) | `reference_only`；未观察到可用于本项目验收的身体、握拍、接触与恢复完整链 |
| CM-M3：[运动页 GIF](https://en.chingmu.com/upload/photo/1764653805917536.gif)，1000×600／49 帧 | 抽取 12 个等间隔帧号，均为步态报告页面移动。[抽帧图](../artifacts/capture-prep/20261003-supplier-review/chingmu-sports-gif-sheet.jpg) | `reference_only`；不属于羽毛球实拍小样 |
| CM-M4：[羽毛球案例 JPEG](https://en.chingmu.com/upload/case/1777253875145150.jpg) | 虚拟羽毛球场、叠加骨架、球拍与数值界面截图 | `reference_only`；可证明展示了专项分析界面，不能证明原始观测的精度或自然动作 |

抽帧法只支持上述可见内容判断，未作全帧运动连续性或播放流畅度验收。原件保留可供进一步逐帧复查；不能用页面“高速”“微秒”字样代替缺失的实拍证据。

| 本项目预审项 | 当前证据状态 | 供应方必须补交 |
| --- | --- | --- |
| 真实羽毛球与正常速度完整动作 | needs_evidence | 未剪辑原始多视角视频，准备→启动→触球→制动→回位→下一拍，给出采集／播放时间映射 |
| 42 个计划槽位与留出 | needs_evidence | 36 技术＋6 连续回合的 takeId、两端、24 开发／18 留出；预审已有样本可先提交但不抵扣试采覆盖 |
| 身体／肘前臂／足地动态误差 | not_measured | 原始标记、功能性标定、独立动态参考、不确定度、遮挡和修补区间；不得只交平滑骨架 |
| 手指、拍面形变与球头接触 | not_measured | 同一事件的手部多视角与局部高速原件、弦面／拍框定义、球头轨迹、遮挡标签 |
| 同步、曝光、事件 U95 | not_measured | 共享时钟／曝光接线、共同脉冲原始记录、逐通道残差／漂移／丢帧、事件总误差预算 |
| 支撑与力学 | not_measured | 力台覆盖／校准／时间轴；台外明确 not_measured，不以动画脚底贴地当实测力 |
| 原件可复现与商业权利 | needs_evidence | 原厂文件＋开放导出、处理版本／日志、逐文件哈希、球员／场地／衍生分发权限 |

所有未测数值保持 null。未运行交付包预检冒充合格交付：公开网页／视频不具备其所需交付结构。P1-3 及 L0–L3 均未通过，旧人物运动失败仍保留。

## 局部高速链的可执行性修正

按 1280×800、12 bit 紧密打包计算，单帧理论 1.536 MB；20k／50k／76k fps 分别约 30.72／76.8／116.736 GB/s（十进制、不计协议、文件头及对齐开销）。256 GB 在 76k 下理论约 2.19 s，与厂商表列 2.2 s 相符；实际时长以具体模式和固件实录为准。

官方 CineMag5e 给出 2 TB 型号 1000 Mpx/s、8 TB 型号 1200 Mpx/s；20k fps 全分辨率已需 20,480 Mpx/s。因此不能承诺直接向该介质不间断写入整场全分辨率高速数据。供应方需提供：

- 每个相机实际 RAM、分区长度、触发前后时长、再武装死区、并行卸载、触发扇出与失败日志。至少用一段连续回合证明预定严格事件均有原件；若只能覆盖孤立挥拍，不能算回合试采通过。
- 在相同视野／标定／照明下比较 20k、50k、76k 的可辨性和事件误差；曝光独立选择。相对速度 100 m/s 时，5 µs 曝光对应 0.5 mm 位移，10 µs 对应 1 mm，仅为运动模糊预算中的近似项。
- 宽度 0.5–1 m 的局部区域映射到 1280 横像素，名义尺度约 0.39–0.78 mm/px；不等于三维重建误差。需多视角、独立尺度与动态参考，拍框／弦面形变单独观测。
- 全场持续链与局部事件链分别标明有效区间；未被局部覆盖的触球不继承严格接触等级。保留至少 8 次双方实际触球、主球员至少 4 次及至少 2 个预先选定严格事件的连续回合要求。

## 下一轮补件与决定点

已准备 [针对性询证函](CAPTURE-SUPPLIER-REQUEST-DRAFT.md)。青瞳应先回答 MC1300 升级与是否承接完整服务；候选集成方需同时交全场／高速／手足链方案、原始小样和权利条件。官方硬件资料只支持模式可行性，不构成设备可租、团队可用或已获报价的证据。

取得供应方回复与原始小样后：先按 [交付预检](../assets/motion/capture/README.md) 检查完整性，再按 [质量门槛](CAPTURE-QUALITY-GATES.md) 做逐项计量、教练／动画复核及 Blender 重定向对照。最终正常速度视觉验收仍需用户参与。本轮未发送询证函；真正实拍小样及其独立质量证明仍缺失。
