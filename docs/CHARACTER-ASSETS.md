# RALLY 第一批人物素材记录

本批采用 Quaternius 的免费 Universal Base Characters **Standard** 导出文件，在本地 Blender 中改编后生成 `src/models/athlete.glb`。角色接入现有比赛姿态与触球判定；人物外观升级不改变比赛规则、骨段长度或球路物理。模型、软件与插件没有新增付费支出；人工整理与验收仍然需要投入。

本记录核查日期：2026-09-10。许可证见 `src/models/LICENSE-Quaternius.txt`；该文件前半部分完整保留下载包的 `License_Standard.txt`，后半部分记录本项目来源与改编。

## 来源候选与免费范围纠正

| 来源 | 作者确认与本地核查 | 本批选择 |
| --- | --- | --- |
| [Universal Base Characters](https://quaternius.com/packs/universalbasecharacters.html) / [作者 itch 页面](https://quaternius.itch.io/universal-base-characters) | 作者整套展示含 Superhero、Regular、Teen，共 6 个男女模型；**本次下载的免费 Standard 只有 Superhero 男、女两个基础人体**。ZIP 内有两个人体的 FBX 与 glTF、6 种头发及 2 种眉型的多种导出版本；无 Regular、Teen 或 `.blend` 制作源文件。随包许可证为 CC0 1.0。 | 使用 `Superhero_Male_FullBody.gltf` 与 `Hair_SimpleParted.gltf`，在本地调瘦和重新绑定。不能把这称为免费 Regular 或 Teen 模型。 |
| [Ultimate Modular Men](https://quaternius.com/packs/ultimatemodularcharacters.html) | 作者页写明 11 个角色、24 个动作、每个角色 4 个可替换部件，提供 FBX、glTF、Blend，CC0；2022 年发布。未下载本包，未核验其骨架与新版 Universal Base 的兼容性。 | 外形比较候选，未进入本批产物。 |
| [Ultimate Animated Character Pack](https://quaternius.com/packs/ultimatedanimatedcharacter.html) | 作者页写明 50+ 动画人物、FBX/OBJ/Blend、CC0；2019 年发布。未下载本包，未核验专项运动、握拍手结构或手机性能。 | 外形比较候选，未进入本批产物。 |

此前根据整套宣传讨论 Regular／Teen 作为免费优先方向，证据不足；以本次实际 ZIP 清单纠正。Standard 免费不等于 Source 免费，使用可导入的 FBX/glTF 也不需要购买作者的 `.blend`。本批未获取或使用付费 Source、Pro，未使用 AI 生成人物，未将源资产上传到外部处理服务。

免费包中的头发文件为 `Hair_Beard`、`Hair_Buns`、`Hair_Buzzed`、`Hair_BuzzedFemale`、`Hair_Long`、`Hair_SimpleParted`；眉型为 `Eyebrows_Female`、`Eyebrows_Regular`。同一发型在原点版、绑定到头骨版及不同格式中重复出现，不应重复计数为更多发型。

作者原始展示图仅供筛选外形，不能当作 RALLY 中已完成的效果或免费内容承诺：

- [Universal Base 整套外形](https://quaternius.com/assets/images/fullres/universalbasecharacters.jpg)
- [Universal Base Standard 范围图](https://quaternius.com/assets/images/fullres/universalbasecharacters/standard.jpg)
- [Ultimate Modular Men 展示图](https://quaternius.com/assets/images/fullres/modularcharacters.jpg)
- [Ultimate Animated Character Pack 展示图](https://quaternius.com/assets/images/fullres/ultimateanimatedcharacter.jpg)

## 已下载文件与校验

| 文件 | 本地位置 | 字节数 | SHA256 |
| --- | --- | ---: | --- |
| Universal Base Characters[Standard].zip | `artifacts/assets-source/universal-base-standard.zip` | 128968391 | `fdbf1804c90dfc1ea03e992bff7da2dfd1a79318e13270a660180f9308455f40` |
| Blender 5.2.1 Windows x64 ZIP | `artifacts/tools/blender-5.2.1-windows-x64.zip` | 404851964 | `0e631dad7d0cad6d5d18abdd2e2550f6c0213215334eda00ddbd3d22b96ecb2c` |

人物包来自作者 itch 的免费 Standard 下载。以上人物包散列是本地文件指纹，用于识别本次输入；没有声称作者发布了相同的校验清单。作者后续更新同名包时，文件散列可能变化，需要重新核查免费范围与许可证。

Blender 来自 [官方 5.2 发布目录](https://download.blender.org/release/Blender5.2/)，使用 [5.2.1 Windows x64 ZIP](https://download.blender.org/release/Blender5.2/blender-5.2.1-windows-x64.zip) 本地解压运行。已重新读取 [官方 SHA256 清单](https://download.blender.org/release/Blender5.2/blender-5.2.1.sha256)，其中 Windows x64 ZIP 的散列与本地实算结果完全一致。使用便携目录中的 Blender，不依赖付费插件；Blender 工具本身不随网页部署。

可在项目根目录复查本地文件：

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath '.\artifacts\assets-source\universal-base-standard.zip'
Get-FileHash -Algorithm SHA256 -LiteralPath '.\artifacts\tools\blender-5.2.1-windows-x64.zip'
```

`artifacts/` 为本地被 Git 忽略的工作材料。下载包、便携软件、检查文件和下载会话链接不作为游戏运行资源，也不应加入源码发布包。使用上面的作者详情页重新获取素材，不保存临时签名下载 URL 到公开文档。

## 本地改编与再生成

构建脚本为 `scripts/prepare-athlete.py`，无需额外命令行参数。默认输入目录：

```text
artifacts/assets-source/base/Universal Base Characters[Standard]/
  Base Characters/Godot - UE/Superhero_Male_FullBody.gltf
  Hairstyles/Origin at 0/glTF (Godot)/Hair_SimpleParted.gltf
```

这些 glTF 的同目录 `.bin` 及关联文件需要保留。原始男性 glTF 静态核查为 3 个 mesh、1 个 skin、65 个关节、0 个动画；“带骨架”不代表本包附带已可用的比赛动作。

脚本保留源人物的头、眉眼、裸露四肢及分缝短发；切除头部下方的肩颈残面，将头部刚性绑定到 `head`，颈部继续使用游戏原有模型。收窄体型后，按 RALLY 现有上臂、前臂、大腿、小腿长度调整并重分配权重。运动上衣、领口、袖口、下摆及两道胸前嵌条由项目生成，袖子使用胸部与肩部的混合权重。游戏已有的精确手部、握拍结构、短裤和鞋继续保留，不以源人物完整手脚替换。源贴图不进入产物，皮肤、头发及运动服使用纯色材质。这些是构造与绑定事实，不表示动作质量已经通过验收。

将源包解压为上述目录，并把官方 Blender ZIP 解压为 `artifacts/tools/blender-5.2.1-windows-x64/` 后，在项目根目录运行：

```powershell
& '.\artifacts\tools\blender-5.2.1-windows-x64\blender.exe' --background --factory-startup --python '.\scripts\prepare-athlete.py'
```

命令写入或更新 `src/models/athlete.glb`。它会重置该后台 Blender 进程的场景；不依赖用户当前打开的 Blender 工程。重新生成后应重新核查模型尺寸、材质、骨名、游戏中的衔接与相关测试；本命令不表示自动部署。

当前生成产物的静态记录为 297572 字节、8931 个三角形、5350 个顶点、5 个材质 primitive、18 个骨骼，0 个贴图、0 个图片、0 个动画片段。三角数来自 GLB 索引 accessor，顶点数来自 5 个不同的 POSITION accessor，分别为 2719、1403、604、456、168；不把 Blender 的多边形数量直接当作三角数。5 个材质 primitive 也不能直接当作整个运动员或比赛场景的 draw call 数量，原颈、手、鞋、短裤、球拍及渲染通道另计。后续修改脚本或素材时需同步更新这条记录。

## 接入合同与验收范围

- glTF/GLB 以米为单位、Y 轴向上，角色朝向和静止骨位需与现有 RALLY 姿态适配一致。运行时不沿用源模型的完整 65 骨架层级。
- 导出 `rally-semantic-v1` 的 18 个语义骨骼：`pelvis`、`spineLow`、`spine`、`chest`、`neck`、`head`，以及左右两侧各自的 `Shoulder`、`Elbow`、`Wrist`、`Hip`、`Knee`、`Ankle`。这是接入现有姿态的约定；不能按名字直接假设兼容任意外部动作。
- 材质名固定为 `rally-skin`、`rally-hair`、`rally-dark`、`rally-shirt`、`rally-accent`，供球员配色区分。产物无外部纹理文件依赖。
- 根位置、脚步锚点、击球动作阶段、`contactAt` 与 `contact` 继续以现有比赛状态为准。GLB 骨骼跟随这些姿态；模型外观不生成新的命中、失误、触网或得分判定。
- 球拍独立跟随持拍姿态，局部拍面中心保持 `(0, .54, 0)`，握持区域仍为柄上 `.03–.11` 米。不能通过伸长手臂或移动权威触球点掩盖模型不匹配。
- 普通局与父子局的既有赛后演出都需保留；本批人物制作不要求特定真人脸，捏脸、身材自定义、可换服装系统与多种体型后置，不是本次承诺。
- GLB 字节、骨骼、材质与无贴图状态为静态核查。动作中的肩肘变形、手腕和手掌衔接、鞋袜衔接、暂停恢复、赛后演出及模型加载失败回退，需要结合游戏验收。构建通过不能代替这些检查。
- 目标设备为 iPhone 13–17；**尚未完成该范围真机验收**。桌面浏览器、模拟尺寸或静态资源预算都不能证明 Safari 实机帧率、温升、触控响应与内存表现。本记录不承诺所有型号已流畅运行。

## 下一批人物制作准备（2026-09-17）

该阶段只建立下一批的动作验收预览与本机制作环境，**没有替换**上述 GLB；新的人物风格方向为运动员比例加适度风格化。预览源码新增高远球和吊球入口，连同准备、往返跑、跳杀和低位跨步，按真实比赛规则生成状态。三视图不是通用样板的开工前提；若后续要复刻指定人物，需要取得用户提供且有权使用的正、侧、背面参考。

本机为 macOS arm64，已把 Blender 5.2.2 LTS 的官方免费安装包放在 Git 忽略的 `artifacts/tools/blender-5.2.2-macos-arm64.dmg`，并只将应用复制到 `artifacts/tools/blender-5.2.2-macos-arm64/Blender.app`；不写入系统应用目录，也不将工具加入网页资源。安装包 SHA-256 是 `dc4125399b8bfefe283cc1624d6cfc7809d1cac20ace51072127eb371f31f210`，与 [Blender 5.2.2 官方清单](https://download.blender.org/release/Blender5.2/blender-5.2.2.sha256) 一致；复制后的应用通过 macOS 代码签名核验，后台执行 `--version` 返回 5.2.2。此前记录的 Windows 5.2.1 工具与本机目录彼此独立。

原先制作脚本仍依赖被忽略的 Quaternius Standard 原始 glTF 与关联文件。**该素材包当前不在本工作目录中**，因此尚不能直接从原始素材重建人物；已有 `src/models/athlete.glb` 可作为观察和适配基线，但不能冒充原始建模源文件。后续若要按原始人物源文件重新拓扑与绑定，先取得并验证许可合规的免费输入；除 Token 费用外不引入任何付费素材、软件、插件、服务或外包。若免费的技术与素材达不到目标质量，须明确反馈差距，不以付费方案替代。

## 首批人物样板（2026-09-17）

新增单独的 `src/models/athlete-pilot.glb`（当前 301584 字节；SHA-256：`5f20084378cc72c415e99aebebaf34c450c344e847852a27bbcf4cba302fbbec`）。它由项目已有的 CC0 衍生 `athlete.glb` 在本机 Blender 改编，并**不是从原始人物包重新建模，更不是对石宇奇本人、球衣或商标的复制**。此次通过修改原有蒙皮网格的腰部和头面轮廓、改出独立的深青绿色服装肩片与侧片材质，保留 18 语义骨骼、球拍触球锚点；没有加入来源不明的真人照片、视频帧或收费资源。原短裤、鞋、手、颈部和球拍仍在游戏运行时生成，单独查看该 GLB 并非完整运动员。

模型编辑脚本为 `scripts/prepare-athlete-pilot.py`；生成本地被忽略的可编辑工程 `artifacts/model-workbench/athlete-pilot.blend` 和上述独立 GLB。观察图脚本为 `scripts/render-athlete-workbench.py`，其静态图只展示 GLB 的局部表面，不能代替游戏内实时动作验收。在本机从项目根目录重新生成（不会写入原版 `athlete.glb`）：

```sh
./artifacts/tools/blender-5.2.2-macos-arm64/Blender.app/Contents/MacOS/Blender --background --factory-startup --python scripts/prepare-athlete-pilot.py
```

预览入口 `?preview=athlete&model=pilot` 可以直接查看新样板，也可以从预览右侧切换“现役球员／新样板 · 试做”。正式比赛继续走原有 `athlete.glb`，**不会因为切换预览而替换正式比赛模型**；有单独的 GLB 体积、骨骼、无贴图和关键击球点测试。石宇奇比赛影像只用作后续对分腿垫步、头顶挥拍、弓步接球和击球后回位的公开动作参考；当前样板**没有**新增运动捕捉、真人动作片段或重新编排的动作，不可宣称已达到 2K 手游或《全明星街球派对》的人物流畅度。需要在预览检查边缘衔接、穿模与实际帧率，再决定下一轮重点；此样板目前是方向验证，不是最终模型。

待逐帧观察的公开参考视频：[BWF TV · Shi Yu Qi: A masterclass in badminton](https://www.youtube.com/watch?v=ygxmg78gna4)、[BWF TV · Shi Yu Qi vs Ayush Shetty | Power and speed on court](https://www.youtube.com/watch?v=yR1bzaB-xVA)。当前仅检索确认官方视频和标题，尚未从视频量取姿态/速度数据，不能称动作已严格复刻。

### 球衣方向迭代（2026-09-17）

按用户提出的“参考尤尼克斯／胜利的专业比赛服气质，但避免照搬”，试做 **RALLY 回位轨迹** 球衣：石墨海军蓝主身、青蓝整片衣袖、浅色袖口和下摆，以及单侧从腰部向上的色块轨迹。袖片按绑定的实际衣袖网格选择，避免按位置硬切导致的锯齿肩线；移除原资产胸前两条凸起斜线（不只是换色），因此与旧球衣图案不共享该装饰。没有品牌名称、字样、LOGO、特定商品编号、现成图案或收费贴图；保持纯本地材质和原骨骼。**这是降低相似度的原创设计做法，不是法律层面的零侵权保证**。本地新服务已核验返回与源码相同的 GLB 字节数和 SHA-256、预览载入状态为 `ready`，并在浏览器画布查看了正面静态效果；相关 13 项自动检查和 PWA 构建通过。未做真机帧率、所有动作姿态或法律审查，样板未推送也未部署线上。
