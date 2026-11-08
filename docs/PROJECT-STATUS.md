# RALLY 项目当前状态

<!-- project-brief
{
  "statusVersion": 1,
  "asOf": "2026-11-08",
  "baseline": {
    "branch": "main",
    "head": "e96ff90fd2e902d91dab58f21a05c9ed1094d335",
    "originMain": "e96ff90fd2e902d91dab58f21a05c9ed1094d335",
    "releaseTag": "v1.13.0"
  },
  "activeTask": {
    "title": "SMASH-1 R4：杀球连贯性与关节检查，准备合并",
    "scope": "保留R3肘领先与髋胸错峰，修复远触点肘腕翻转、引拍停顿及离地脚部补偿突变；修正手臂误绑定头部造成的腕部尖刺。",
    "nextAction": "核对最终原速/慢放实物，自审、提交PR，检查通过后按用户授权合并并核验生产部署。",
    "blockedBy": [],
    "documents": [
      "docs/tasks/SMASH-1.md"
    ],
    "checkpoint": "docs/SMASH-1-CHECKPOINT.md"
  },
  "runtime": {
    "formalAsset": "src/models/athlete.glb",
    "releaseState": "User authorized merge after smoothing and joint checks; final local validation in progress.",
    "localPreview": {
      "task": "SMASH-1",
      "url": "http://127.0.0.1:3257/?preview=smash&revision=4-skin-final",
      "worktree": "/Users/xindong/Documents/开拍rally-smash-motion",
      "verifiedOn": "2026-11-08",
      "buildId": "b04f294f9765fca9",
      "limitations": "正式模型ready且实际读取最终构建；无实体手机实测，不宣称完整表面碰撞或专业动捕验收。"
    }
  },
  "readNext": [
    "docs/tasks/SMASH-1.md",
    "docs/SMASH-1-CHECKPOINT.md"
  ],
  "links": [
    "docs/tasks/UI-2.md",
    "docs/UI-2-CHECKPOINT.md"
  ],
  "handoff": {
    "taskId": "SMASH-1",
    "branch": "feat/SMASH-1-natural-motion",
    "baselineHead": "e96ff90fd2e902d91dab58f21a05c9ed1094d335",
    "taskFile": "docs/tasks/SMASH-1.md",
    "worktree": "/Users/xindong/Documents/开拍rally-smash-motion",
    "phase": "R4完整回归通过，最终录像与合并准备",
    "stopReason": "进行中；用户已认可前一动作并授权继续优化、测试通过后合并。",
    "nextAction": "核对最终原速/慢放实物，自审、提交PR，检查通过后按用户授权合并并核验生产部署。",
    "checkpoint": "docs/SMASH-1-CHECKPOINT.md",
    "validation": "761/761测试，构建b04f294f9765fca9；4590组独立非杀球姿态/过渡逐字段一致。宽触点双侧骨长/腕角/翻转检查、正式GLB腕部表面及头部牵拉回归通过。",
    "scopeBoundary": "用户2026-11-08授权继续优化杀球、检查关节，测试通过后合并main；已核实main会自动发布。"
  },
  "publication": "R4仍在本地；本轮获得提交、合并授权，准备推送PR。版本号和发布标签暂不变。"
}
-->
