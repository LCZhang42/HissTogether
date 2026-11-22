# 齐齐哈尔！ / Hiss Together!

> 四只小猫，一声哈气。让大家在同一瞬间一起哈！  
> Four tiny cats. One mighty hiss. Can everyone hiss at the same time?

![Four pixel-art kittens hissing together](apps/client/public/assets/cats/previews/hiss_lineup.png)

《齐齐哈尔！》是一款中英双语的四人合作网页游戏。每位玩家控制一只像素小猫：先看清是谁靠近，危险来了就一起哈气，猫妈妈回来则要一起忍住。

邀请朋友、随机匹配陌生玩家，或者让 AI 补上空位。每次猫咪夜班共有六轮、三颗猫爪；完成整晚巡逻前，小猫们要在危险面前一起哈气，也要在猫妈妈回来时一起忍住。

## 游戏玩法

1. 选择一种开始方式：
   - **随机匹配**：最多等待 8 秒；凑满 4 名真人会立即开始。
   - **邀请朋友**：复制房间链接，让朋友加入同一个房间。
   - **和机器人开始**：空位立即由 AI 小猫补满。
2. 看到影子靠近时先别急，等待线索与来者现身。前两轮会明确教学；从第三轮开始，界面只给轮廓与声音线索，不再提前显示“该哈/该忍”的答案。
3. 如果是狗、陌生人或假扮猫妈妈的扫地机器人，按下 **空格键**或触控界面的 **哈气**按钮；四次哈气的有效时间重叠至少 500 毫秒，即可完成“齐齐哈尔！”
4. 如果是猫妈妈，所有小猫都要忍住不哈；任何一只猫误哈都会失败。
5. 判断正确会增加连击与分数；判断错误会失去一颗猫爪并清空连击。完成六轮即可下班，三颗猫爪全部用完则夜班失败。

轮廓与线索阶段提前哈气也会失败。真假猫妈妈共享同一种猫形轮廓：真妈妈是正常铃声，假妈妈则混入失真的铃声与马达声，必须等完整揭示后再判断。失败反馈会明确区分“还没看清”“误哈妈妈”“有猫没哈”和“判断正确但时间没对齐”。

没有凑满真人也可以玩：匹配超时后，所有正在等待的玩家会进入同一局，其余位置由 AI 补齐。游戏进行期间，新匹配到的真人只会在安全的轮次间隔替换 AI，不会突然打断正在进行的哈气。

AI 小猫会在危险揭示后按照共同节奏响应，在猫妈妈出现时保持安静。它们的时序由房间和遭遇编号确定，方便复现同步问题。

每个房间有三分钟挑战时间。每轮结束后会自动进入下一轮；完成六轮、猫爪耗尽或时间结束后，会显示本班分数、正确轮次和最佳连击，并可直接再值一班。

## 操作

| 操作 | 键盘 | 触控 |
| --- | --- | --- |
| 哈气 | `Space` | 哈气按钮 |
| 左右移动 | `A` / `D` 或方向键 | 左右按钮 |
| 喵一声 | `E` | 喵按钮 |
| 和附近小猫互动 | `F` | 互动按钮 |
| 情境快捷操作 | `Enter` | — |

移动、喵叫和互动不会影响同步判定，它们只是让等待下一次哈气时更热闹一点。

`Enter` 会根据当前状态执行主要操作：首次进入时开始随机匹配，轮次反馈时立即进入下一轮，夜班结算后重新开局。

## 游戏特色

- 完整的简体中文与英文界面，可随时切换并自动记住选择。
- 私人房间、公开随机匹配，以及 AI 自动补位。
- 服务器权威判定，四位玩家看到相同的结果和倒计时。
- 断线后保留猫咪位置 10 秒，短暂刷新可以自动回到原位。
- 九种手绘像素姿势：待机、准备、哈气、恢复、侧目、走路、喵叫、互动和惊讶。
- 服务器同步的靠近预警与身份揭示：狗、陌生人和伪装成猫妈妈的扫地机器人需要哈气，真正的猫妈妈需要克制。
- 六轮猫咪夜班、三颗共享猫爪、连续正确连击、完美同步奖励和整晚结算。
- 分层误导机制：轮廓 → 声音线索 → 完整揭示；前两轮教学，后四轮隐藏答案提示与安全/危险色。
- 不同的失败演出：提前哈、误哈妈妈、漏掉危险和四猫不同步。
- 真实猫咪哈气录音、独立音效、静音选项和减少动态效果选项。
- 桌面键盘与移动端触控均可游玩。

## English overview

**Hiss Together!** is a bilingual four-player cooperative browser game built around a six-wave night shift. The team shares three paws: hiss together at dogs, strangers, and a robot vacuum disguised as Cat Mom, but hold when the real Cat Mom returns. Correct calls build combo and score; a threat requires at least 500 ms of shared hiss overlap.

Use **Quick Match** to find online players, share a private room link with friends, or start immediately with bots. Empty slots are filled automatically, and newly matched humans replace bots only between waves. Finish all six waves before the team runs out of paws to clear the night.

## 本地运行 / Local development

需要 Node.js 20+ 和 npm 10+。

```bash
npm install
npm run dev
```

打开 <http://localhost:5173>。默认 WebSocket 地址为 `ws://localhost:8080`。

前端支持热更新；修改服务器代码后，需要重新启动 `npm run dev`。

### 局域网设备测试

在可信任的本地网络中运行：

```bash
npm run dev:lan
```

然后在手机、平板或其他电脑上打开：

```text
http://<电脑的局域网 IP>:5173
```

客户端会自动使用当前页面的主机名连接 WebSocket。更完整的测试流程见 [试玩测试指南](docs/playtest-runbook.md)。

## 常用命令

```bash
npm run typecheck       # TypeScript 类型检查
npm test                # 逻辑与 WebSocket 联机测试
npm run test:browser    # Chrome / Edge 多浏览器测试
npm run build           # 生产构建
npm run validate:assets # 像素素材验证
npm run simulate:triggers # 触发时序与延迟公平性模拟
```

浏览器测试会启动多个隔离的无头浏览器会话，不会自动下载浏览器。若 Chrome 或 Edge 安装在非标准位置，可以设置 `CHROME_PATH`。

## 环境变量

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `PORT` | `8080` | WebSocket 服务器端口 |
| `CHALLENGE_MS` | `180000` | 每局挑战时长 |
| `MATCHMAKING_WAIT_MS` | `8000` | 随机匹配等待时间 |
| `BOT_PROFILE_MODE` | `seeded` | AI 节奏模式；测试可设为 `cycle` 使用固定循环 |
| `VITE_WS_URL` | `ws://localhost:8080` | 客户端 WebSocket 地址 |

## 技术架构

- `apps/client`：TypeScript、Vite、Phaser 3 与 HTML/CSS 界面。
- `apps/server`：Node.js 与 `ws`，负责房间、匹配和权威同步判定。
- `packages/shared`：客户端与服务器共享的协议、触发事件类型和纯判定逻辑。
- `tests`：Vitest 联机测试与 Playwright 多浏览器测试。
- `tools`：像素素材标准化和验证工具。
- `docs`：美术规范与试玩测试文档。

服务器仍是最终判定权威。客户端会附带经过时钟偏移校正的按键时间估计，服务器最多补偿 80ms 且绝不允许输入早于身份揭示；这能降低高 RTT 玩家反复成为“最晚猫”的概率，同时限制客户端可影响的范围。公开匹配队列目前保存在单个服务器进程的内存中，适合 MVP 与单实例部署。未来若扩展为多台服务器，需要使用 Redis 等共享队列。

猫咪哈气使用经过验证的 CC0 录音，并针对四个位置加入轻微的音高和声道变化。来源与授权信息见 [音频说明](apps/client/public/assets/audio/README.md)。
