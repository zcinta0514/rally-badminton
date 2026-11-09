# 专项采集计划与填报模板

对应 [主规格](../../../docs/MOTION-CAPTURE-SPEC.md) 和 [现场清单](../../../docs/CAPTURE-SHOOT-PLAN.md)，规格 rally-capture/2.0。这里仅存准备材料，不含真实采集数据。

- [capture-plan.json](capture-plan.json)：42 个 planned slots，36 条技术动作、6 段连续回合；24 条开发、18 条整段留出。planned slot 不是已经存在的 take。实际 attempt 与 slot 分别编号，失败尝试不覆盖。
- [delivery-manifest.template.json](delivery-manifest.template.json)：供应方每批交付复制后填写的索引。files／channels／takes 当前为空，所有验收层均 needs_evidence。
- [event-record.template.json](event-record.template.json)：每次触球的起止区间、观测链与误差预算。复制到交付包 annotations/，关联 manifest；模板不得作为实际事件送入质量统计。

本目录为 JSON 模板，不是完整 JSON Schema。已提供[只读入库预检](../../../scripts/check-capture-delivery.mjs)，核对文件与声明的一致性；它不自动导入资产，也不授予科学或运动质量通过。

运行：node scripts/check-capture-delivery.mjs /实际交付目录

交付根目录须有 manifest.json。标准输出为 JSON；退出码 0 表示 ready_for_review（材料可送审），1 表示 rejected，2 表示命令参数错误。所有结果的 motionAcceptance 都是 not_assessed。工具不修改交付文件，不发起网络请求，不启动 Blender 或改动游戏资产。

## 填报规则

1. 实际交付从受控资产库读取，项目中只保留去身份化索引。删除模板的 kind 标识并填写实际 deliveryId／takeId／eventId 之前，该文件始终是空模板，不得汇入实测。
2. 所有实际文件索引必须有 id、相对路径 path、字节数 bytes、SHA256、层级 layer、类别 role、来源 sourceFileIds。路径相对于该交付根目录，禁止路径越界；外部受控对象使用单独 assetStoreId 定位，不在路径放访问令牌或个人信息。
3. channels 每项必须有 id、deviceId、type、sourceFileIds、originalRateHz、resolution、shutterType、exposureFileId、timestampFileId、clockMappingFileId、units、calibrationIds、validTimeRanges_s、missingIntervalsFileId。不适用字段填 null 并写 reason；缺失、遮挡和未标定不是不适用。
4. takes 每项含 id、slotId、sessionId、playerIds、primaryPlayerId、courtEnd、split、technique、start_s／end_s、channelIds、fileIds、eventFileIds、supportWindowsFileId、calibrationIds、rightsEvidenceIds、status。所有 ID 必须在本包或带版本的依赖清单中可解析；每个 slot 可以关联多个尝试，但最终选择与拒收历史明确。
5. 支撑 sidecar 按脚与实际支点记录窗口起止、接触／承重的观测来源、力台覆盖、估计或修补区间。partial／unseparable／not_measured 保留；不把未知反力写 0，不把物理反演改成 observed。
6. derivations 记录输入／输出文件 ID 与 SHA256、工具／脚本／配置版本、处理顺序、操作者 ID、时间、滤波与时间延迟、插值／人工修订区间及原因。原始文件只读，新结果新增版本；take／事件 ID 始终可追溯。
7. 事件 frameRanges 每项指定 fileId／channelId、firstFrame／lastFrame（非负、含首尾的原始帧号）、exposureStart_s／exposureEnd_s（主时钟下曝光覆盖范围）。contactStart 与 contactEnd 不合并成手速峰值。U95_s 填能覆盖所报区间的保守半宽；非对称区间仍完整保留 lower_s／upper_s。无法可靠测得的值保留 null；补偿／重采样不能覆盖原始时钟。
8. 指标报告逐层逐 take／事件保留原始误差序列、n_total／n_valid／n_missing、最长缺失段、median／p95／max、p95 的 95% CI、独立样本组数、单位、独立参考、预算算法和规格版本。速度预算使用保守上界；不得把缺失当作零。
9. 质量状态采用 pass／warn／needs_evidence／fail／not_applicable，含义见 [质量门槛](../../../docs/CAPTURE-QUALITY-GATES.md)。计划的 planned 状态不属于质量通过。证据充分且所有适用严格项满足后才能填写 pass；warn 需要处置意见；not_applicable 需有效理由。
10. 整段身体验收、逐事件触球、手部和力学覆盖分别声明。汇总不得屏蔽任一适用失败；未测的必要项仍 needs_evidence。humanReviews 保留实际意见、证据和时间，不能用 AI 或供应方生成的名字虚构签署。

## 当前验证范围

预检首版检查：文件 SHA256／字节数与安全相对路径（含符号链接越界）、唯一 ID／来源循环／跨文件引用、主时钟与坐标定义、原始时间戳严格递增、项目槽位／两端／留出分组、事件归属与声明、接触时间区间、速度相关时间预算及空间总预算的基本一致性、必要复核引用及汇总不得掩盖子项未过。

通道 timestampFileId 指向已列入 files 的 JSON：schemaVersion 为 1，channelId 与通道一致，unit 为 s，values_s 为原始有限时间戳数组（严格递增）。只读原始时间戳，不重采样；时钟映射后的动态精度另审。当前预检只支持本包内的文件引用；跨包依赖需先复制到独立待审交付包并保留来源链，不能原地改动原件。项目计划从本仓库读取，不信任供应方自行替换 planFile。

每批可以只交一部分槽位；每槽最多一条选定 take，其他尝试放 rejectedAttempts 并保留原件。整体42条覆盖仍需汇总验收。连续回合通过声明另填 realContactsBothPlayers／realContactsPrimaryPlayer；计数真实性需回看完整原始记录。

尚未自动验证：图像实际可辨性、两视角几何重建、帧号与相机文件实际内容的一致性、时钟映射／漂移与漏帧表真实性、曝光／带宽、独立参考及误差序列重算、接地／力台数据、衍生处理复现、权利和人工签署真实性。完整填写要求仍按上文与质量规格执行；工具未报错不豁免这些要求。已声明失败的材料可完整送审作诊断，不会升级为质量通过。

专项测试：node --test tests/capture-delivery.test.js。测试只在临时目录生成明确标为 TEST-ONLY 的合成记录，不是专业球员动捕数据；不得用于证明试采精度。
