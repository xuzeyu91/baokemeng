# AGENTS.md

## Architecture Notes
- RPG 主入口：`rpg.html` + `rpg.js` + `rpg.css`，数据依赖 `data.js`。
- 对标红蓝（关都）：`LEVELS` 10 章；`BADGE_ORDER` 8 徽章；`ITEM_CATALOG` + 商店/背包。
- 存档字段：`money` / `badges` / `items` / `defeated` / `npcDone` / `maxLevel` / `champion` / `finalRewardClaimed` / `claimedRewards`。
- 战斗：`resolveMove`（STAB/暴击/命中/灼烧物攻减半）、`preActionStatus` / `finishRound` 回合末异常。
- 多阶段训练家：`stages` + `startStage`；奖金/徽章仅在最终阶段 `endBattle` 发放。
- 战斗 party 必须是 `buildCombat` 结果；`save.party` 同步用 `member.exp/level`，不可写 `c.exp`。
- 章节奖励：`grantLevelReward` 经 `claimedRewards[idx]` 防重复；`showLevelReward` 负责展示。

## Known Issues / Conventions
- 地图仍为程序生成关卡，不是完整像素城镇地图。
- 改 `rpg.js` 后请 bump `rpg.html` 中 `rpg.js?v=` 缓存版本。
- 捕捉失败 / 道具 / 换人 / 未命中 / 异常跳过行动后，回合应交给 `oppTurn`（勿只 `finishRound` 或竞态 `endYourTurn`）。
- 主角地图形象用 `playerSpriteId()`（优先存活领队），绘制时带黄环 +「我」标识；`drawSpriteOnTile(..., isPlayer=true)` 会放大精灵。
- `buildLevelMap` 特殊地块优先级：起点 `P` → 中心 `C` → 传送门 `G`（中心与起点重合时必须保持 `C`）。
- 自动化测试：`node test_rpg.js`（RPG 逻辑）、`node test_game.js`（卡牌对战）。
