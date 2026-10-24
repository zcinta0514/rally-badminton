# RALLY 项目当前状态

<!-- project-brief
{
  "statusVersion": 1,
  "asOf": "2026-10-24",
  "baseline": {
    "branch": "main",
    "head": "01fed373cea2ff89e0776e3cf5d34b1c7f77f16a",
    "originMain": "01fed373cea2ff89e0776e3cf5d34b1c7f77f16a",
    "releaseTag": "v1.10.0"
  },
  "activeTask": {
    "title": "PACE-1 / 1.11.0 最终验证完成，准备合并",
    "scope": "职业与业余录像逐帧取样，校准球的减速和人物移动节奏；工程验证完成，用户手感待确认。",
    "nextAction": "用户已授权核实后合并。提交PR，等待Node22/24 CI成功后合并main，核对两处部署。",
    "blockedBy": [
      "远端CI与生产部署尚待完成。",
      "真手机手感与双真机WebRTC未实测。"
    ],
    "documents": [
      "docs/tasks/PACE-1.md",
      "docs/RELEASE-1.11.0-QA.json"
    ],
    "checkpoint": "docs/RELEASE-1.11.0-CHECKPOINT.md"
  },
  "runtime": {
    "formalAsset": "src/models/athlete.glb",
    "releaseState": "1.11.0本地721/721与构建通过；线上当前仍1.10.0。",
    "localPreview": {
      "task": "PACE-1",
      "url": "http://127.0.0.1:3063/",
      "worktree": "/Users/xindong/Documents/开拍rally/.cindy-worktrees/vibrant-thompson",
      "pid": 20663,
      "buildId": "a41043ea6cbc4d21",
      "sidebarTab": "PACE-1 玩法测试",
      "verifiedOn": "2026-10-24",
      "limitations": "侧边栏已恢复并实测发球与移动；任务未在主窗口展开时预览可能保持1×1，选中本任务再focus即可恢复。真机手感待确认。"
    },
    "comparisonPreview": {
      "url": "http://127.0.0.1:3064/",
      "pid": 8405,
      "baseline": "01fed373",
      "candidate": "6b2724b6",
      "scope": "相同站位／输入／人物／镜头的真实共享规则重放；不代表旧版整套UI录像；五场景验证通过。",
      "evidence": "artifacts/pace-compare/RESULT.md",
      "sidebarTab": "修复前后同步对比"
    }
  },
  "readNext": [
    "docs/tasks/PACE-1.md",
    "docs/RELEASE-1.11.0-CHECKPOINT.md"
  ],
  "links": [
    "docs/tasks/PACE-1.md",
    "docs/PACE-1-REAL-QA.json",
    "docs/PACE-1-REAL-REFERENCE.md",
    "docs/PACE-1-CHECKPOINT.md",
    "docs/tasks/FX-4.md",
    "docs/FX-4-CHECKPOINT.md",
    "docs/FX-4-QA.json",
    "docs/RELEASE-1.10.0-CHECKPOINT.md",
    "docs/RELEASE-1.10.0-QA.json",
    "docs/RELEASE-1.9.0-QA.json",
    "docs/tasks/R-1.9.0.md",
    "docs/RELEASE-1.9.0-CHECKPOINT.md",
    "docs/tasks/BAL-1.md",
    "docs/BAL-1-CHECKPOINT.md",
    "docs/BAL-1-QA.json",
    "docs/tasks/ENTRY-1.md",
    "docs/ENTRY-1-CHECKPOINT.md",
    "docs/ENTRY-1-QA.json",
    "docs/AI-1-COACH-CHECKPOINT.md",
    "docs/tasks/AI-1.md",
    "docs/AI-1-SHOT-RECOVERY-CHECKPOINT.md",
    "docs/AI-1-FIX-CHECKPOINT.md",
    "docs/AI-1-STAMINA-CHECKPOINT.md",
    "docs/tasks/RELEASE-FX.md",
    "docs/RELEASE-PREP-CHECKPOINT.md",
    "docs/WORKFLOW.md",
    "docs/DEPLOYMENT.md"
  ],
  "handoff": {
    "taskId": "PACE-1",
    "branch": "cindy/vibrant-thompson",
    "baselineHead": "01fed373cea2ff89e0776e3cf5d34b1c7f77f16a",
    "taskFile": "docs/tasks/PACE-1.md",
    "worktree": "/Users/xindong/Documents/开拍rally/.cindy-worktrees/vibrant-thompson",
    "phase": "最终验证完成，准备PR合并",
    "stopReason": "用户已授权核实后合并，版本与公告同步，当前没有测试失败。",
    "nextAction": "用户已授权核实后合并。提交PR，等待Node22/24 CI成功后合并main，核对两处部署。",
    "checkpoint": "docs/RELEASE-1.11.0-CHECKPOINT.md",
    "validation": "1.11.0最终721/721、88资源a41043ea6cbc4d21，Pages路径b9cf9dd3efba46e4；服务含sw逐字节一致；浏览器发球/移动/接吊/接杀通过；WebSocket协议9双客户端一致。远端CI待验。",
    "scopeBoundary": "用户授权最终核实后合并并核对现有main自动部署；不改人物并行成果，不使用子代理。"
  },
  "publication": "当前线上1.10.0；本轮1.11.0准备合并，尚未核验生产。"
}
-->

用户已授权最终核实后合并。1.11.0本地验证完成，远端CI及生产部署待核验。
