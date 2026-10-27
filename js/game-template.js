// ============================================================================
// ★ Ember 游戏「底座」（双引擎）
//
//   设计原则：**只给地基，不给玩法**。
//   - 默认引擎 Phaser 3：保证任何类型的游戏都能正确初始化、切换场景、存档、
//     暂停、自适应、生成贴图；玩法那一层留给模型自由发挥。
//   - 备选引擎 原生 Canvas：用户明确说「不用库 / 极简」时使用。
//
//   为什么不做「回合制骨架 / ARPG 骨架」：会限制创意。
//   底座里只放一个 20 行的示例玩法，并强制要求模型整体替换掉。
//
//   Phaser 加载顺序：本地 phaser.min.js → jsdelivr → unpkg → bootcdn
//   （本地优先 = 断网也能玩；游戏目录里有 phaser.min.js 时自动生效）
// ============================================================================
(function () {
  'use strict';

  var GAME_RE = /游戏|小游戏|RPG|rpg|贪吃蛇|打飞机|飞机大战|跑酷|跳跃|弹球|俄罗斯方块|扫雷|塔防|射击|平台|消除|2048|冒险|地牢|卡牌|对战|吞噬|进化|生存|slg|roguelike|memory|snake|breakout|platformer|shooter|game/i;

  // ======================== ★ 像素风分级（8 位 / 16 位 / MD） ========================
  // 关键词命中顺序：先判具体机种，再判通用像素
  var PIXEL_8_RE = /8\s*-?\s*bit|8\s*位|八位|红白机|\bFC\b|\bNES\b|game\s*boy|\bGB\b|掌机/i;
  var PIXEL_MD_RE = /MD\s*机|世嘉|mega\s*drive|genesis|索尼克/i;
  var PIXEL_16_RE = /16\s*-?\s*bit|16\s*位|十六位|\bSFC\b|\bSNES\b|超级任天堂|街机/i;
  // 现代像素：hi-bit / 精致 / 高清 —— 重点在"好看"，不追求硬件限制
  var PIXEL_MODERN_RE = /现代像素|精致像素|高清像素|高清点阵|像素艺术|精美像素|hi\s*-?\s*bit|hd\s*pixel|pixel\s*hd|modern\s*pixel/i;
  // 只要命中任意一个具体机种或"像素/复古"，就说明是像素风需求
  var PIXEL_ANY_RE = new RegExp([
    PIXEL_8_RE.source, PIXEL_MD_RE.source, PIXEL_16_RE.source, PIXEL_MODERN_RE.source,
    '像素', 'pixel', '点阵', '复古', 'retro'
  ].join('|'), 'i');

  // 三档像素硬指标：8bit（严格限制）/ 16bit（默认，含 MD·SFC·街机）/ modern（现代精致）
  var PIXEL_TIERS = {
    '8bit': {
      label: '8 位机（FC / 红白机 / GB 风格）',
      res: '256×224（或 160×144 掌机风格）',
      colors: '同屏 ≤ 16 色（含黑白），整套调色板不超过 24 色',
      shade: '只有 3 阶：暗 / 中 / 亮，不要高光层',
      shape: '**只能整像素矩形**：禁止 fillCircle / fillRoundedRect，圆用 PX.circle 拼',
      anim: '动画 2~3 帧，帧率 6~8',
      extra: '渐变必须用 PX.dither 棋盘抖动或直接硬分阶，禁止平滑渐变'
    },
    '16bit': {
      label: '16 位机（SFC / SNES / MD / 街机 / 复古像素风）',
      res: '320×224',
      colors: '同屏 32~64 色',
      shade: '5~6 阶明暗 + 柔和高光，可做简单光晕',
      shape: '允许圆和曲线，但必须像素对齐（整数坐标），禁止抗锯齿',
      anim: '动画 4~8 帧，帧率 8~12',
      extra: '可以用 2~3 层视差滚动；发光用色阶模拟（外深内亮），不要 blur。'
        + '如果用户特别提到 MD / 世嘉 / Genesis，色调偏暗、饱和度偏高、质感更硬朗；'
        + '提到 SFC / SNES / 街机，则偏明亮柔和、颜色更丰富。没提就取中间值'
    },
    'modern': {
      label: '现代像素（hi-bit / 精致像素风）',
      res: '480×270 或 640×360（比 16 位机更细腻）',
      colors: '64~128 色，允许丰富渐变（但仍走色板，不要真彩渐变）',
      shade: '6~8 阶明暗：暗部 / 中间调 / 亮部 / 高光 / 边缘光，逐层叠加',
      shape: '允许圆、斜线、细描边，但像素必须整数对齐',
      anim: '动画 6~10 帧，帧率 10~12；动作要有预备/缓冲，不要匀速',
      extra: '可用：轻度抖动做柔和渐变、边缘光（rim light）、淡淡的环境光遮蔽、'
        + '2~3 层视差背景、少量粒子（灰尘/萤火）；发光用 3 层色阶模拟（外深内中内亮），禁止 blur 和真半透明渐变'
    }
  };

  // 判定用户的像素风档位；没提像素返回 null
  // 三档：8bit（硬件限制严格）/ 16bit（默认，覆盖 MD·SFC·街机·复古）/ modern（现代精致）
  function pixelTierOf(text) {
    var s = String(text || '');
    if (!PIXEL_ANY_RE.test(s)) return null;
    if (PIXEL_8_RE.test(s)) return '8bit';         // 明确说 8 位 → 严格限制
    if (PIXEL_MODERN_RE.test(s)) return 'modern';  // 现代 / 精致 / hi-bit
    return '16bit';                                // 其余（像素/复古/MD/世嘉/SFC/SNES/街机）统一 16 位
  }

  function pixelRulesFor(tier) {
    var t = PIXEL_TIERS[tier];
    if (!t) return '';
    return [
      '【像素风硬性规格】' + t.label,
      '- 逻辑分辨率：' + t.res,
      '- 色数：' + t.colors,
      '- 明暗：' + t.shade,
      '- 形状：' + t.shape,
      '- 动画：' + t.anim,
      '- 额外：' + t.extra,
      '',
      '【真像素的技术底线（违反就不算像素风）】',
      '1. 配置必须是 pixelArt: true，且整数倍缩放（Phaser.Scale.FIT + 小分辨率）。',
      '2. **禁止**使用 fillCircle / fillRoundedRect / strokeCircle 等会抗锯齿的 API。',
      '3. 所有绘制只用：PX.rect（直角矩形）、PX.circle（用矩形拼的圆）、PX.dither（抖动）。',
      '4. 所有坐标和尺寸必须是整数（Math.round 后再画），不允许 0.5 像素。',
      '5. 亮暗靠"换颜色"表现，不要用 alpha 半透明叠色做渐变。',
      '6. 需要"圆"的地方用 PX.circle，它内部是逐行矩形，边缘硬。'
    ].join('\n');
  }

  // ---------------------------------------------------------------------------
  // ★ 画面密度：不达标就是"简陋"
  //   这段对所有游戏都生效（像素风、矢量风都一样），只是门槛按档位不同。
  // ---------------------------------------------------------------------------
  function densityRulesFor(tier) {
    var elements = 30, deco = 8, frames = 'idle / walk / attack 三组';
    if (tier === '8bit') { elements = 20; deco = 5; frames = 'idle / walk 两组（8 位机可以更少）'; }
    else if (tier === 'modern') { elements = 40; deco = 12; frames = 'idle / walk / attack / hurt 四组'; }
    return [
      '【画面密度（这是"好看"和"简陋"的分水岭，必须做到）】',
      '1. 地面 / 地砖：至少 2 种纹理（表面层 + 内部层），表面画 1~2px 亮线、底部画 1~2px 暗线。',
      '   **禁止**用一整块纯色矩形当地面。',
      '2. 平台：顶边高光线 + 底边阴影线 + 左右 1px 描边，不要纯色方块。',
      '3. 背景：至少 3 层（天空 / 远景剪影 / 中景装饰），每层要有横向重复的图形元素。',
      '4. 场景装饰：树木、石头、草丛、路牌、火把、箱子等散点装饰 ≥ ' + deco + ' 个，成组摆放。',
      '5. 光源统一：默认光从左上来 —— 所有物体左上亮、右下暗，全场统一。',
      '6. 角色：高度 ≥ 24px，并且至少有 ' + frames + '。',
      '7. **禁止**出现"一整屏只有 2~3 个大色块 + 一个小角色"的空旷画面。',
      '8. 满屏至少 ' + elements + ' 个绘制元素（地面块、装饰、平台、角色、UI 都算）。'
    ].join('\n');
  }
  var CANVAS_RE = /不用库|不要库|纯\s*canvas|不要\s*phaser|不用\s*phaser|极简|最简单|最小实现/i;
  // ★ 3D 需求 → 用 Three.js（Phaser 是 2D 引擎，做不了真 3D）
  var THREE_D_RE = /\b3\s*D\b|三维|立体|three\.?js|第一人称|第三人称|open\s*gl/i;

  // 版本必须和 lib/phaser.min.js 保持一致（本地是 3.90.0），否则本地/CDN 两套 API 可能不一致
  var CDN = [
    'https://cdn.jsdelivr.net/npm/phaser@3.90.0/dist/phaser.min.js',
    'https://unpkg.com/phaser@3.90.0/dist/phaser.min.js',
    'https://cdn.bootcdn.net/ajax/libs/phaser/3.90.0/phaser.min.js'
  ];

  // Phaser 加载链：本地优先，再走三个 CDN
  function phaserTags() {
    var out = [];
    out.push('<script src="phaser.min.js"><\/script>');
    out.push('<script>');
    out.push('  // 本地没有 phaser.min.js 时，依次从镜像加载');
    CDN.forEach(function (u) {
      out.push('  if (!window.Phaser) document.write(\'<scr\' + \'ipt src="' + u + '"><\\/scr\' + \'ipt>\');');
    });
    out.push('<\/script>');
    return out.join('\n');
  }

  // ---------------------------------------------------------------------------
  // ★ 生成后纠正 Phaser 的加载方式
  //
  //   模型的行为很不稳定：有时写死一个 CDN 地址（版本还乱），
  //   有时照抄了回退链又额外写一个 CDN 标签（结果加载两遍）。
  //   所以这里做成**幂等**：不管原来有几个 Phaser 加载块，最后只留一个
  //   「本地优先 + 三重 CDN 回退」。
  // ---------------------------------------------------------------------------
  var LOADER_BLOCK = phaserTags();

  // ======================== ★ 多文件项目判定 ========================
  // 显式要求 → 多文件；需求复杂度够高（RPG/地图/剧情/多种敌人）→ 也多文件
  var MULTI_HINT_RE = /多文件|多个文件|分文件|拆文件|项目结构|模块化|工程化/i;
  var MULTI_SIZE_RE = /RPG|rpg|ARPG|冒险|剧情|对话|任务|商店|技能树|技能|职业|装备|背包装备|地图|关卡|BOSS|boss|存档|城镇|地牢|副本|升级|属性|npc|NPC/i;

  function wantMultiFile(text) {
    var s = String(text || '');
    if (MULTI_HINT_RE.test(s)) return true;
    return MULTI_SIZE_RE.test(s);
  }

  // 判断一个 <script> 块是不是"Phaser 加载器"
  function isPhaserLoader(block) {
    var isExternal = /\bsrc\s*=/i.test(block) && /phaser/i.test(block);
    var isInlineFallback = /document\.write/i.test(block) && /phaser/i.test(block);
    return isExternal || isInlineFallback;
  }

  function normalizePhaserLoader(html) {
    var s = String(html || '');
    if (!/phaser/i.test(s)) return s;                        // 不是 Phaser 游戏，不动
    // 没有引擎代码也不动（避免误伤只是提到 phaser 名字的页面）
    if (!/new\s+Phaser\.Game|Phaser\.Scene|Phaser\.AUTO/.test(s)) return s;

    // 逐个匹配 <script ...>...</script>（懒匹配，不会跨块吞掉后面的代码）
    var re = /<script\b[^>]*>[\s\S]*?<\/script>/gi;
    var hits = [];
    var m;
    while ((m = re.exec(s)) !== null) {
      if (isPhaserLoader(m[0])) hits.push({ start: m.index, end: m.index + m[0].length });
    }

    // 情况一：找到了若干加载块 → 全部删掉，只在第一个位置插一份
    if (hits.length) {
      var out = '', cursor = 0;
      hits.forEach(function (h, i) {
        var gap = s.slice(cursor, h.start);
        if (i === 0) {
          out += gap + LOADER_BLOCK;
        } else if (!/^\s*$/.test(gap)) {
          out += gap;                     // 纯空白的间隔直接丢掉，避免每跑一次多一个空行
        }
        cursor = h.end;
      });
      return (out + s.slice(cursor)).replace(/\n{3,}/g, '\n\n');
    }

    // 情况二：一个加载块都没有（模型可能把库直接内联了，或漏了）→ 补一个
    var anchor = -1;
    var divGame = /<div\b[^>]*\bid\s*=\s*["']game["'][^>]*>\s*<\/div>/i.exec(s);
    if (divGame) {
      anchor = divGame.index + divGame[0].length;
    } else {
      var firstGameScript = /<script\b[^>]*>(?:(?!<\/script>)[\s\S])*?(?:new\s+Phaser\.Game|Phaser\.Scene)/i.exec(s);
      if (firstGameScript) anchor = firstGameScript.index;
    }
    if (anchor < 0) return s;
    return s.slice(0, anchor) + '\n' + LOADER_BLOCK + '\n' + s.slice(anchor);
  }

  // ---------------------------------------------------------------------------
  // ★ 角色画法参考：光说「女性化」「精美」模型没有落点，必须给可执行的像素线索
  // ---------------------------------------------------------------------------
  var CHAR_RULES = [
    '【角色像素画法参考（男女差异靠这些具体线索，不是只换颜色）】',
    '- 分区比例：24px 高 → 头/头盔 8px + 身体 10px + 腿 6px；32px 高 → 12 + 13 + 7。',
    '- 男性：肩宽 = 躯干宽，腰不收，轮廓平直，短发只占头顶 2~3px。',
    '- 女性：肩宽比男性窄 2px，**腰部再收窄 3~4px**（上宽下窄），',
    '  头发垂到肩下（左右各 3~4px 宽，比头顶长 8~12px），',
    '  眼睛上方加 1px 睫毛线，下身用裙甲/裙摆（梯形，用 PX.diamond 画）。',
    '- 金发：用同一色相的 3 阶（暗金 / 亮金 / 高光），不要只用一种黄色。',
    '- 装备可见：换武器要改手持物的形状和长度，换盔甲要改胸甲分块、肩甲轮廓、头盔造型，',
    '  **只改颜色会让人看不出换了装备**。',
    '- 走路动画：腿部前后错位（stride ±3px）+ 身体上下浮动（bob ±2px），两帧就能看出在走。'
  ].join('\n');

  // ---------------------------------------------------------------------------
  // 通用规范（与玩法无关）
  // ---------------------------------------------------------------------------
  var COMMON_RULES = [
    '【这是「游戏」需求。规范分三层：技术底线 / 画面规格 / 玩法自由。】',
    '看清楚每一层的要求：底层不能违反，中层按需求覆盖，上层完全自由。',
    '',
    '═══ 第一层 · 技术底线（无条件遵守，违反就是 bug）═══',
    '',
    '一、文件形态',
    '- 只产出一个 HTML 文件，CSS 与 JS 全部内联；双击就能玩。',
    '- 禁止引用任何图片 / 音频 / 字体文件；美术全部用代码绘制，音效用 WebAudio 合成。',
    '- 页面铺满视口，无滚动条，窗口缩放自动适配。',
    '',
    '二、物理与坐标（最容易出 bug 的地方）',
    '- 挂了物理体的对象（physics.world.enable / physics.add.sprite 等），**位移必须改物理体**：',
    '  用 body.reset(x, y) / body.setVelocity() / body.x, body.y；',
    '  **禁止只调 setPosition / x = 却不改 body** —— 那样显示动了、判定框留在原地，攻击和碰撞全部失效。',
    '- ★ **贴图键绝不能传 null**。`physics.add.sprite(x, y, null)` 在 Phaser 里会画成「绿底斜线」的',
    '  缺失贴图占位块，满屏绿方块就是这么来的。只想挂物理体、画面用 graphics 手绘时，两种正确写法：',
    '  ① `this.physics.add.sprite(x, y, "__WHITE").setVisible(false)`；',
    '  ② 先在 create 里生成一张透明贴图再复用：',
    '     `if(!this.textures.exists("blank")){let b=this.make.graphics({add:false});b.fillStyle(0xffffff,0);b.fillRect(0,0,2,2);b.generateTexture("blank",2,2);b.destroy()}`',
    '     然后 `this.physics.add.sprite(x, y, "blank").setVisible(false)`。',
    '- 静态平台改过尺寸或位置后，必须调用 refreshBody()。',
    '- 距离判定统一用中心点，或统一用左上角，**同一份代码里不许混用**（否则会出现隔空攻击/打不中）。',
    '- 所有绘制坐标取整（Math.round），像素风不允许 0.5 像素。',
    '',
    '三、视差背景',
    '- 背景图层的绘制宽度必须 ≥ 世界宽 × scrollFactor + 屏宽，否则镜头一滚就露白。',
    '- 例：世界 2400 宽、scrollFactor 0.1、屏宽 480 → 背景至少画 2400×0.1+480 = 720 宽。',
    '',
    '四、全屏 UI',
    '- 默认：打开背包 / 菜单 / 设置等全屏 UI 时，暂停物理与移动输入，关闭后恢复。',
    '- 例外：用户明确说「像黑魂那样实时不暂停」「背包不暂停」时才允许不暂停。',
    '',
    '五、必须有',
    '1. 开始界面（写清玩法与操作）→ 游戏中 → 结束界面（本局得分 / 最高分）。',
    '2. 计分 + 最高分（localStorage 记住）；有长进度需求时提供「继续游戏」。',
    '3. 结束后按空格或点击即可再来一局。',
    '4. 键盘（方向键 / WASD）与触屏点击都要能操作。',
    '5. 手机能真正玩（见下面「手机 / 触屏」一节，那是硬性要求，不是可选项）。',
    '',
    '═══ 手机 / 触屏（硬性要求：电脑和手机都要能玩）═══',
    '',
    'A. 手机浏览器基础（不做就等于手机上打不开/乱缩放）',
    '- <head> 里必须有：',
    '  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">',
    '- 样式里必须有：',
    '  html,body{margin:0;padding:0;overflow:hidden;background:#000;touch-action:none;',
    '           -webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;}',
    '  canvas{display:block;touch-action:none;}',
    '- ★ 点击/拖拽一律用 pointerdown / pointerup / pointermove，',
    '  **禁止使用 mousedown / mouseup / click 做游戏内交互**（手机上有兼容问题、还会延迟 300ms）。',
    '- 所有可点区域不小于 44×44 px。',
    '',
    'B. 判断"要不要触摸操作"（不要无脑加摇杆）',
    '- 游戏**用到了键盘**（方向键 / WASD / 空格跳跃）→ **必须**同时提供屏幕摇杆 + 动作按钮。',
    '- 游戏**只靠点击**（文字冒险、选择分支、消除、点卡片、点按钮）→ **不要**加摇杆和按钮，',
    '  那种游戏手机本来就能玩，加了反而挡住画面。',
    '- 摇杆/按钮只在触摸设备显示：',
    '  if (this.sys.game.device.input.touch) { 显示摇杆 } else { 不显示 }',
    '',
    'C. 虚拟摇杆怎么接（关键：不许为触摸另写一套玩法）',
    '- 摇杆只负责**往同一套方向变量里写值**，玩法代码照旧读那套变量 / keys。',
    '- 推荐做法：把方向统一成对象 dir = {x:0, y:0}，键盘和摇杆都改它，移动逻辑只读它。',
    '- 用 Phaser 时，摇杆的现成写法见下面「引擎：Phaser 3」一节里的 makeTouch（直接抄，不要重造）。',
    '- 用原生 Canvas 时，用 pointerdown/pointermove 自己算相对摇杆圆心的偏移量，同样写进 dir。',
    '',
    'D. 其它手机适配',
    '- 暂停：除了 ESC 键，**必须在右上角放一个可点的暂停按钮**（手机没有键盘）。',
    '- 竖屏：检测到竖屏而玩法是横向时，盖一层"请横屏玩"的提示，点一下可关闭。',
    '- 全屏 UI（背包/菜单）在手机上关闭按钮要足够大、位置避让摇杆。',
    '- 不要监听 window 的 scroll / resize 去做游戏逻辑，用 Phaser 的 scale 事件。',
    '',
    '═══ 第二层 · 画面规格（按下面【画面风格】一节执行，用户可覆盖）═══',
    '',
    '六、表现与结构',
    '- 画面严格按【画面风格】里给的那一档规格做（像素档位，或平滑矢量）。',
    '- **调色板先行**：动手画之前，先在代码顶部定义一个 ART 调色板（8~16 色，每色注明用途），',
    '  之后所有绘制**只准用这些颜色**，不允许中途冒出调色板里没有的颜色。',
    '- 参考画面密度时，可以想「像《星露谷物语》的地面密度」「像《空洞骑士》的剪影层次」这类量级。',
    '- 数值（速度、血量、伤害、刷新间隔、成长曲线）集中放在顶部 CONFIG 区，方便调平衡。',
    '- 按「配置 / 调色板 / 工具 / 贴图 / 场景 / 玩法」分块，写中文注释。',
    '- 底座里标了「画面区」的那部分：**保留这套做法**（调色板、代码生成贴图、三层背景、',
    '  地面纹理、装饰物、粒子），**但内容必须按本次题材整体替换** ——',
    '  用户要室内就换成墙/地板/吊灯/家具，要沙漠就换成沙丘/仙人掌/沙地，',
    '  **不允许把底座的夜空、草地、树木原样套到别的题材上**。',
    '',
    '七、输出前自检（逐条确认，任何一条不满足就回去补）',
    '1. 有没有 ART 调色板？所有绘制是不是都从调色板取色？',
    '2. 地面是不是有纹理（不是一整块纯色）？平台是不是有高光边和阴影边？',
    '3. 背景是不是 ≥ 3 层？每层有没有横向重复的元素？',
    '4. 场景装饰是不是 ≥ 8 个（树/灌木/石头/花/火把/箱子）？',
    '5. 角色是不是 ≥ 24px 高，并且有 idle / walk / attack 三组帧（8bit 可 2 帧）？',
    '6. 满屏绘制元素是不是 ≥ 30 个？有没有出现"2~3 个大色块 + 一个小角色"的空旷画面？',
    '7. 光源方向是不是统一的（默认左上亮、右下暗）？',
    '',
    '八、输出',
    '- 只输出这一个 HTML 文件的内容，不要额外解释。',
    '- 必须基于下面的底座改造：保留引擎初始化、场景切换、暂停、计分、存档、重开、**画面区**；只替换「玩法区」。',
    '',
    '═══ 第三层 · 玩法自由（这一层本规范不做任何限制）═══',
    '- 类型随便：动作、横板跳跃、ARPG、回合制、塔防、吞噬成长、生存、卡牌、消除、Roguelike…',
    '- 机制随便：无尽 / 关卡 / 成就 / 合成 / 升级树 / 剧情分支，按需求做。',
    '- 底座里的「示例玩法」只是演示如何调用底座，**必须整体替换**为本次需求的玩法。',
    '- 需要地图时用数据驱动（二维数组描述地形），不要硬编码上百个 if。'
  ].join('\n');

  var PHASER_RULES = [
    COMMON_RULES,
    '',
    '═══ 引擎：Phaser 3（必须使用）═══',
    '- 用 Phaser 3.90（与本地打包的 lib/phaser.min.js 同版本），配置必须包含 pixelArt: true、',
    '  physics: { default: "arcade" }、scale: { mode: Phaser.Scale.FIT }。',
    '- 场景用底座里的 Boot / Menu / Game / Pause / Over，用 this.scene.start() / launch() 切换。',
    '- 物理碰撞用 this.physics.add.overlap / collider，不要自己手写逐帧碰撞循环（除非确有需要）。',
    '- 需要回合或格子逻辑时自己实现队列/网格，不要硬塞进物理系统。',
    '',
    '═══ 手机虚拟摇杆 · Phaser 版（键盘控制的游戏必须加，点击类不要加）═══',
    '- 把下面这段原样放进代码（放在 U 工具对象附近、或 Game 场景外），不要自己重造：',
    "  // 左下角虚拟摇杆 + 右下角动作按钮（只在触摸设备上创建）",
    "  function makeTouch(scene, onDir, onAction) {",
    "    if (!scene.sys.game.device.input.touch) return;",
    "    var W = scene.scale.width, H = scene.scale.height;",
    "    var r = Math.max(52, Math.min(W, H) * 0.13);          // 摇杆半径，随屏幕缩放",
    "    var cx = r + 28, cy = H - r - 28;                      // 左下角",
    "    var base = scene.add.circle(cx, cy, r, 0xffffff, 0.16).setScrollFactor(0).setDepth(9999);",
    "    var knob = scene.add.circle(cx, cy, r * 0.42, 0xffffff, 0.42).setScrollFactor(0).setDepth(10000);",
    "    var active = false;",
    "    function setKnob(px, py) {",
    "      var dx = px - cx, dy = py - cy, d = Math.sqrt(dx*dx + dy*dy) || 1;",
    "      var lim = r * 0.62;",
    "      if (d > lim) { dx = dx / d * lim; dy = dy / d * lim; }",
    "      knob.setPosition(cx + dx, cy + dy);",
    "      onDir(dx / lim, dy / lim);                            // -1 ~ 1",
    "    }",
    "    function reset() { active = false; knob.setPosition(cx, cy); onDir(0, 0); }",
    "    scene.input.on('pointerdown', function (p) {",
    "      if (p.x < W * 0.5) { active = true; setKnob(p.x, p.y); }",
    "    });",
    "    scene.input.on('pointermove', function (p) { if (active) setKnob(p.x, p.y); });",
    "    scene.input.on('pointerup', reset);",
    "    var br = Math.max(34, r * 0.72);                        // 动作按钮",
    "    var bx = W - br - 30, by = H - br - 30;",
    "    var btn = scene.add.circle(bx, by, br, 0x3ecf8e, 0.55).setScrollFactor(0).setDepth(9999)",
    "      .setInteractive();",
    "    scene.add.text(bx, by, '跳', { fontSize: Math.round(br * 0.7) + 'px', color: '#06231a' })",
    "      .setOrigin(0.5).setScrollFactor(0).setDepth(10000);",
    "    btn.on('pointerdown', function () { btn.setAlpha(0.85); onAction(true); });",
    "    btn.on('pointerup', function () { btn.setAlpha(0.55); onAction(false); });",
    "  }",
    '- 调用示例（在 Game 场景 create 里，把摇杆接到同一套方向变量上）：',
    "  makeTouch(this, function (dx, dy) {",
    "    dir.x = Math.abs(dx) < 0.22 ? 0 : dx;                  // 死区，防手抖",
    "    dir.y = Math.abs(dy) < 0.22 ? 0 : dy;",
    "  }, function (down) { this.jumpPressed = down; }, true);",
    '',
    '═══ 引擎加载方式（这一段必须逐字照抄，禁止改写）═══',
    '- **第一个** `<script src>` 必须是 `<script src="phaser.min.js"></script>`（相对路径，不带任何域名）。',
    '  工坊预览和 Agent 生成都会自动把 phaser.min.js 放到同一目录，所以这条路径一定能找到。',
    '- 紧跟着用 document.write 依次回退：jsdelivr → unpkg → bootcdn（只在本地文件缺失时才用到）。',
    '- **不要**把主加载写成 `<script src="https://cdn.../phaser.min.js"></script>` 这种直接指向 CDN 的单一标签，',
    '  也不要用 window load 事件动态插入 CDN 脚本当主加载方式。',
    '- 版本号必须是 **3.90.0**（与本地 lib/phaser.min.js 一致），不要写成 3.80 或其它版本。'
  ].join('\n');

  var CANVAS_RULES = [
    COMMON_RULES,
    '',
    '═══ 引擎：原生 Canvas 2D（不要引入任何库）═══',
    '- ctx.imageSmoothingEnabled = false，坐标为整数。',
    '- 用 requestAnimationFrame + 时间增量（delta）驱动。',
    '- 用状态机（ready / playing / paused / over）组织流程，不要用 setTimeout 做延时逻辑。',
    '- 有物理需求时自己实现简单的 AABB / 圆形判定，并保证「判定用的坐标」和「画的位置」是同一套。'
  ].join('\n');

  // ======================== ★ 3D 游戏规范（Three.js）=======================
  var THREE_RULES = [
    '',
    '【这是「3D 游戏」需求。引擎用 Three.js，**不要用 Phaser**，也不要读 phaser.min.js。】',
    '',
    '═══ 硬性要求 ═══',
    '1. 单文件 index.html，Three.js 用 CDN 的 ES module 方式引入：',
    '   <script type="importmap">{"imports":{"three":"https://unpkg.com/three@0.160.0/build/three.module.js"}}</script>',
    '   <script type="module">import * as THREE from "three";</script>',
    '   再准备一份回退：unpkg 失败时改用 https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js。',
    '2. **禁止引用任何贴图/模型/音频文件**：几何体全部用 BoxGeometry / CylinderGeometry / PlaneGeometry 等程序化生成，',
    '   材质用 MeshLambertMaterial / MeshStandardMaterial + 纯色；音效用 WebAudio 合成。',
    '3. 必须有的东西：透视相机（PerspectiveCamera）+ 至少一个方向光/环境光 + 雾效（scene.fog）撑远景色。',
    '4. 渲染循环用 renderer.setAnimationLoop 或 requestAnimationFrame，用 Clock 取 delta 做与帧率无关的移动。',
    '5. 窗口 resize 时更新 camera.aspect 与 renderer.setSize。',
    '',
    '═══ 3D 赛车游戏的具体做法（照这个来，不要发明第二套）═══',
    '- 赛道：一条由 CatmullRomCurve3 生成的闭合曲线，用 TubeGeometry 或沿曲线放置的路面块渲染；',
    '  或用最简单可靠的办法：一块很大的 PlaneGeometry 当路面 + 两侧重复的护栏方块 + 中央虚线。',
    '- 车：车身 BoxGeometry（长宽比约 4:2:1）+ 4 个 CylinderGeometry 轮子（绕 X 轴旋转 90 度），整车放进一个 Group。',
    '- 相机：第三人称跟车（相机位置 = 车后上方偏移，lookAt 车头前方），带轻微延迟/插值。',
    '- 操控：↑/W 加速、↓/S 刹车倒车、←→/A D 转向（转向幅度随速度变化），空格手刹。',
    '- 速度与转向必须用 delta 乘算（速度 += 加速度 * delta），不能用固定每帧增量。',
    '- 赛道边界判定：用平面坐标范围或曲线参数判断是否出界，出界减速而不是直接穿模。',
    '- 计分：圈数 / 用时 / 最高速，localStorage 存最佳成绩；开始界面 + 结束界面 + 空格重开。',
    '',
    '═══ 手机 / 触屏（硬性要求：电脑和手机都要能开）═══',
    '- <head> 必须有：<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">',
    '- 样式必须有：html,body{margin:0;overflow:hidden;touch-action:none;-webkit-user-select:none;} canvas{touch-action:none;}',
    '- 触摸一律用 pointerdown / pointermove / pointerup，**不要用 mousedown / click 做游戏内操作**。',
    '- 3D 赛车这类需要方向的游戏，**必须**同时提供触摸操控（手机上没有键盘）：',
    '  · 左下角虚拟摇杆：拖动时把横向量写入转向、纵向量写入油门/刹车（死区 0.2 防手抖）；',
    '  · 右下角两个按钮：「油门」「刹车」，中间可再加「手刹」；圆形半透明，不小于 60px。',
    '  · 只在触摸设备上创建（检测 navigator.maxTouchPoints > 0），桌面上隐藏。',
    '  · 摇杆/按钮只往同一套输入变量里写值（如 input = {steer:0, throttle:0, brake:0}），',
    '    键盘和触摸都改它，物理逻辑只读它 —— 不要为触摸另写一套玩法。',
    '- 右上角放一个可点的「暂停 / 重开」按钮（手机没有 ESC 和空格）。',
    '- 竖屏时覆盖一层「请横屏玩」提示，点一下可关闭。',
    '',
    '═══ 输出前自检 ═══',
    '1. 有没有 import Three.js？没有 CDN 裸标签混用。',
    '2. 车和赛道是不是程序化几何体（没有引用外部模型/贴图）？',
    '3. 相机是不是跟着车？键盘能不能开？',
    '4. 有没有开始/结束/重开？',
    '5. 手机能不能开（viewport + 触摸摇杆/按钮 + 暂停按钮，这三样都在吗）？',
    '6. 有没有把 2D 的 Phaser 代码混进来？（有就删掉）',
    '',
    '═══ 输出 ═══',
    '- 只输出这一个 HTML 文件的内容，不要额外解释。'
  ].join('\n');

  // ======================== ★ 多文件工程规范 ========================
  var MULTI_RULES = [
    COMMON_RULES,
    '',
    '═══ 引擎：Phaser 3（多文件工程）═══',
    '- 用 Phaser 3.90，配置包含 pixelArt: true、physics: { default: "arcade" }、scale: { mode: Phaser.Scale.FIT }。',
    '- 场景用 Boot / Menu / Game / Pause / Over，用 this.scene.start() / launch() 切换。',
    '- 手机虚拟摇杆：把「手机虚拟摇杆 · Phaser 版」那段 makeTouch 放进 js/assets.js，',
    '  键盘控制的游戏必须接上（摇杆写同一套方向变量，玩法逻辑只读它）。',
    '',
    '═══ 手机虚拟摇杆 · Phaser 版（键盘控制的游戏必须加，点击类不要加）═══',
    '- 把下面这段原样放进 js/assets.js，不要自己重造：',
    "  // 左下角虚拟摇杆 + 右下角动作按钮（只在触摸设备上创建）",
    "  function makeTouch(scene, onDir, onAction) {",
    "    if (!scene.sys.game.device.input.touch) return;",
    "    var W = scene.scale.width, H = scene.scale.height;",
    "    var r = Math.max(52, Math.min(W, H) * 0.13);",
    "    var cx = r + 28, cy = H - r - 28;",
    "    var base = scene.add.circle(cx, cy, r, 0xffffff, 0.16).setScrollFactor(0).setDepth(9999);",
    "    var knob = scene.add.circle(cx, cy, r * 0.42, 0xffffff, 0.42).setScrollFactor(0).setDepth(10000);",
    "    var active = false;",
    "    function setKnob(px, py) {",
    "      var dx = px - cx, dy = py - cy, d = Math.sqrt(dx*dx + dy*dy) || 1;",
    "      var lim = r * 0.62;",
    "      if (d > lim) { dx = dx / d * lim; dy = dy / d * lim; }",
    "      knob.setPosition(cx + dx, cy + dy);",
    "      onDir(dx / lim, dy / lim);",
    "    }",
    "    function reset() { active = false; knob.setPosition(cx, cy); onDir(0, 0); }",
    "    scene.input.on('pointerdown', function (p) {",
    "      if (p.x < W * 0.5) { active = true; setKnob(p.x, p.y); }",
    "    });",
    "    scene.input.on('pointermove', function (p) { if (active) setKnob(p.x, p.y); });",
    "    scene.input.on('pointerup', reset);",
    "    var br = Math.max(34, r * 0.72);",
    "    var bx = W - br - 30, by = H - br - 30;",
    "    var btn = scene.add.circle(bx, by, br, 0x3ecf8e, 0.55).setScrollFactor(0).setDepth(9999)",
    "      .setInteractive();",
    "    scene.add.text(bx, by, '跳', { fontSize: Math.round(br * 0.7) + 'px', color: '#06231a' })",
    "      .setOrigin(0.5).setScrollFactor(0).setDepth(10000);",
    "    btn.on('pointerdown', function () { btn.setAlpha(0.85); onAction(true); });",
    "    btn.on('pointerup', function () { btn.setAlpha(0.55); onAction(false); });",
    "  }",
    '- 在 Game 场景 create 里接上：',
    "  makeTouch(this, function (dx, dy) {",
    "    dir.x = Math.abs(dx) < 0.22 ? 0 : dx;",
    "    dir.y = Math.abs(dy) < 0.22 ? 0 : dy;",
    "  }, function (down) { this.jumpPressed = down; }, true);",
    '',
    '═══ 目录结构（必须严格照此拆分，不要合并成单文件）═══',
    '  index.html     入口：只放 <div id="game">、加载链、四个 <script src>；禁止写任何游戏逻辑',
    '  js/config.js   所有数值 + 所有数据表（装备 / 敌人 / 道具 / 地图 / 对话 / 关卡）',
    '  js/assets.js   U 工具 + PX 像素工具 + 贴图生成 + 动画注册',
    '  js/scenes.js   全部场景类（Boot / Menu / Game / Pause / Over）',
    '  js/main.js     只负责 new Phaser.Game(...) 并传入场景列表',
    '  phaser.min.js  引擎库，应用会自动放好，**不要生成它**',
    '',
    '═══ 脚本加载顺序（index.html 内部必须按这个顺序）═══',
    '  1) phaser.min.js（带回退链）',
    '  2) js/config.js',
    '  3) js/assets.js',
    '  4) js/scenes.js',
    '  5) js/main.js',
    '',
    '═══ 跨文件约定（很容易踩坑，务必遵守）═══',
    '- 全部是普通 <script>，**禁止 import / export / require**。',
    '- 每个文件都用 var / function 顶层声明，**不要包 IIFE**（否则其他文件读不到）。',
    '- 不要在 js 文件里写 DOMContentLoaded / window.onload，脚本按顺序执行即可。',
    '- scenes.js 可以直接用 CFG / PX / U（config.js、assets.js 已先加载）。',
    '- main.js 可以直接用 BootScene 等类名（scenes.js 已先加载）。',
    '',
    '═══ 修改定位指南（用户以后提修改需求时按这个找文件）═══',
    '- 调平衡 / 改数值（速度、血量、伤害、掉率、成长）→ js/config.js',
    '- 加数据（新武器、新敌人、新地图、对话文本）→ js/config.js',
    '- 改贴图 / 改动画 / 加绘制工具 → js/assets.js',
    '- 加场景 / 改流程 / 改界面 → js/scenes.js',
    '- 改引擎配置（分辨率、重力、缩放）→ js/main.js',
    '- 改入口 / 加脚本引用 → index.html',
    '',
    '═══ 输出方式 ═══',
    '- 逐个文件输出完整内容，每个文件一个代码块，代码块前用一行注明文件路径。',
    '- 五个文件都要给全，禁止省略、禁止写「其余同上」。',
    '- 不要生成 phaser.min.js。'
  ].join('\n');

  // 多文件骨架：五个文件的最小可运行版本（比单文件骨架更精简，只给结构）
  var MULTI_SKELETON = [
    '===== 文件：index.html =====',
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">',
    '<title>游戏</title>',
    '<style>html,body{margin:0;height:100%;background:#0b0d0f;overflow:hidden;}',
    '#game{width:100%;height:100%;}canvas{display:block;image-rendering:pixelated;}</style>',
    '</head>',
    '<body>',
    '<div id="game"></div>',
    phaserTags(),
    '<script src="js/config.js"></script>',
    '<script src="js/assets.js"></script>',
    '<script src="js/scenes.js"></script>',
    '<script src="js/main.js"></script>',
    '</body>',
    '</html>',
    '',
    '===== 文件：js/config.js =====',
    '// 所有数值与数据表都放这里，改平衡只改这个文件',
    '// 本档位色板要求：{{PALETTE_HINT}}',    'var ART = {',
    '  // 在这里定义本作的固定调色板（每色注明用途），之后所有绘制只准从 ART 取色',
    '  // 至少要有这些键（否则贴图生成函数会取不到颜色）：',
    '  // sky0 sky1 sky2 sky3 star moon moonHi far mid grassTop grassMid grassDark dirt dirtDark',
    '  // trunk leaf leafHi skin armor armorDark eye gold',
    '};',
    'var CFG = {',
    '  W: {{W}}, H: {{H}},',
    '  WORLD_W: 1600,',
    '  PLAYER_SPEED: 120,',
    '  GRAVITY: 800,',
    '  SAVE_KEY: "game_save"',
    '};',
    'var DATA = {',
    '  weapons: [ { id: "w1", name: "铁剑", atk: 1 } ],',
    '  enemies: [ { id: "e1", name: "小怪", hp: 3, speed: 40, atk: 1 } ]',
    '};',
    '',
    '===== 文件：js/assets.js =====',
    '// 绘制工具 + 贴图生成 + 动画注册',
    'var U = {',
    '  tex: function (scene, key, w, h, color) {',
    '    if (scene.textures.exists(key)) return;',
    '    var g = scene.make.graphics({ x: 0, y: 0, add: false });',
    '    g.fillStyle(color, 1); g.fillRect(0, 0, w, h);',
    '    g.generateTexture(key, w, h); g.destroy();',
    '  },',
    '  rand: function (a, b) { return Phaser.Math.Between(a, b); },',
    '  save: function (d) { try { localStorage.setItem(CFG.SAVE_KEY, JSON.stringify(d)); } catch (e) {} },',
    '  load: function () { try { return JSON.parse(localStorage.getItem(CFG.SAVE_KEY) || "null"); } catch (e) { return null; } },',
    '  clearSave: function () { try { localStorage.removeItem(CFG.SAVE_KEY); } catch (e) {} },',
    '  beep: function (freq, dur, type) {',
    '    try {',
    '      if (!window.__actx) window.__actx = new (window.AudioContext || window.webkitAudioContext)();',
    '      var a = window.__actx, o = a.createOscillator(), g = a.createGain();',
    '      o.type = type || "square"; o.frequency.value = freq; g.gain.value = 0.04;',
    '      o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + (dur || 0.08));',
    '    } catch (e) {}',
    '  }',
    '};',
    'var PX = {',
    '  rect: function (g, x, y, w, h, c) { g.fillStyle(c, 1); g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); },',
    '  circle: function (g, cx, cy, r, c) {',
    '    cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r); g.fillStyle(c, 1);',
    '    for (var yy = -r; yy <= r; yy++) {',
    '      var dx = Math.floor(Math.sqrt(r * r - yy * yy));',
    '      g.fillRect(cx - dx, cy + yy, dx * 2 + 1, 1);',
    '    }',
    '  },',
    '  dither: function (g, x, y, w, h, c, step) {',
    '    step = step || 2; g.fillStyle(c, 1);',
    '    for (var yy2 = 0; yy2 < h; yy2 += step) {',
    '      for (var xx2 = 0; xx2 < w; xx2 += step) {',
    '        if ((xx2 / step + yy2 / step) % 2 === 0) g.fillRect(Math.round(x + xx2), Math.round(y + yy2), 1, 1);',
    '      }',
    '    }',
    '  }',
    '};',
    '// 在 Boot 场景里调用：统一生成所有贴图（必须带纹理，不许纯色方块）',
    'function makeAllTextures(scene) {',
    '  var g, i;',
    '  // 地面 32×32：泥土 + 石子 + 草皮（上 7px 带亮线）',
    '  g = scene.make.graphics({ x: 0, y: 0, add: false });',
    '  PX.rect(g, 0, 0, 32, 32, ART.dirt);',
    '  for (i = 0; i < 8; i++) PX.rect(g, U.rand(1, 29), U.rand(9, 30), 2, 2, ART.dirtDark);',
    '  PX.rect(g, 0, 0, 32, 7, ART.grassMid);',
    '  PX.rect(g, 0, 0, 32, 3, ART.grassTop);',
    '  PX.rect(g, 0, 7, 32, 1, ART.grassDark);',
    '  g.generateTexture("tile", 32, 32); g.destroy();',
    '  // 树 / 灌木 / 石头（成组摆放用）',
    '  g = scene.make.graphics({ x: 0, y: 0, add: false });',
    '  PX.rect(g, 14, 30, 6, 24, ART.trunk);',
    '  PX.circle(g, 17, 24, 15, ART.leaf);',
    '  PX.circle(g, 15, 16, 8, ART.leafHi);',
    '  g.generateTexture("tree", 34, 54); g.destroy();',
    '  // 角色三帧（idle + 两帧走路）',
    '  for (i = 0; i < 3; i++) {',
    '    g = scene.make.graphics({ x: 0, y: 0, add: false });',
    '    var l1 = i === 1 ? 7 : 4, l2 = i === 2 ? 7 : 9;',
    '    PX.rect(g, l1, 16, 3, 8, ART.armorDark);',
    '    PX.rect(g, l2, 16, 3, 8, ART.armorDark);',
    '    PX.rect(g, 3, 8, 10, 9, ART.armor);',
    '    PX.rect(g, 4, 2, 8, 7, ART.skin);',
    '    PX.rect(g, 5, 4, 1, 2, ART.eye);',
    '    PX.rect(g, 10, 4, 1, 2, ART.eye);',
    '    g.generateTexture("hero" + i, 16, 24); g.destroy();',
    '  }',
    '}',
    '',
    '// 三层背景：远景建筑剪影 / 中景树林 / 近景草坡',
    '// 宽度必须 ≥ 世界宽 × scrollFactor + 屏宽，否则镜头一滚就露白',
    'function drawBackdrop(scene, worldW) {',
    '  var i, farW = worldW * 0.15 + CFG.W, midW = worldW * 0.35 + CFG.W, nearW = worldW * 0.6 + CFG.W;',
    '',
    '  // 天空：4 段渐变 + 抖动过渡 + 星星 + 月亮（禁止整块纯色）',
    '  var sky = scene.add.graphics().setScrollFactor(0).setDepth(-200);',
    '  var bands = [ART.sky0, ART.sky1, ART.sky2, ART.sky3];',
    '  for (i = 0; i < 4; i++) {',
    '    PX.rect(sky, 0, i * (CFG.H / 4), CFG.W, CFG.H / 4 + 1, bands[i]);',
    '    if (i > 0) PX.dither(sky, 0, i * (CFG.H / 4), CFG.W, 10, bands[i - 1], 2);',
    '  }',
    '  for (i = 0; i < 42; i++) PX.rect(sky, U.rand(0, CFG.W), U.rand(0, CFG.H * 0.62), 1, 1, ART.star);',
    '  PX.circle(sky, CFG.W - 58, 46, 15, ART.moon);',
    '  PX.circle(sky, CFG.W - 62, 42, 11, ART.moonHi);',
    '',
    '  // 远景：城镇剪影（屋身 + 三角屋顶 + 窗光），只占天空下沿一条',
    '  var far = scene.add.graphics().setScrollFactor(0.15).setDepth(-150);',
    '  var farBase = CFG.H * 0.76;',
    '  for (i = 0; i < farW / 46 + 1; i++) {',
    '    var bx = Math.round(i * 46 + U.rand(0, 14));',
    '    var bw = U.rand(16, 30), bh = U.rand(18, 44), by = farBase - bh;',
    '    PX.rect(far, bx, by, bw, bh, ART.far);',
    '    for (var rh = 0; rh < 7; rh++) {',
    '      var rw = Math.round(bw * (1 - rh / 7));',
    '      PX.rect(far, bx + Math.round((bw - rw) / 2), by - rh - 1, rw, 1, ART.far);',
    '    }',
    '    for (var wy = 0; wy < Math.floor(bh / 14); wy++) {',
    '      if ((i + wy) % 3 === 0) continue;',
    '      PX.rect(far, bx + 4, by + 8 + wy * 14, 2, 3, ART.gold);',
    '    }',
    '  }',
    '',
    '  // 中景：树林 —— 间距和高度都要随机，否则会像一排栅栏',
    '  var mid = scene.add.graphics().setScrollFactor(0.35).setDepth(-100);',
    '  PX.rect(mid, 0, CFG.H * 0.86, midW, CFG.H * 0.14, ART.mid);',
    '  var mx = 4;',
    '  while (mx < midW) {',
    '    var th = U.rand(16, 36);',
    '    PX.rect(mid, mx + 3, CFG.H * 0.86 - th, 3, th, ART.mid);',
    '    PX.circle(mid, mx + 4, CFG.H * 0.86 - th - 4, U.rand(5, 10), ART.mid);',
    '    if (U.rand(0, 2) === 0) PX.circle(mid, mx - 2, CFG.H * 0.86 - 5, U.rand(3, 6), ART.mid);',
    '    mx += U.rand(16, 52);',
    '  }',
    '',
    '  // 近景：草坡 + 不规则草叶',
    '  var near = scene.add.graphics().setScrollFactor(0.6).setDepth(-50);',
    '  PX.rect(near, 0, CFG.H * 0.92, nearW, CFG.H * 0.08, ART.grassDark);',
    '  var nx = 0;',
    '  while (nx < nearW) {',
    '    PX.rect(near, nx, CFG.H * 0.92 - U.rand(2, 4), U.rand(1, 3), U.rand(2, 4), ART.grassMid);',
    '    nx += U.rand(5, 18);',
    '  }',
    '}',
    '',
    '===== 文件：js/scenes.js =====',
    '// 所有场景：Boot / Menu / Game / Pause / Over',
    'function BootScene() { Phaser.Scene.call(this, { key: "Boot" }); }',
    'BootScene.prototype = Object.create(Phaser.Scene.prototype);',
    'BootScene.prototype.constructor = BootScene;',
    'BootScene.prototype.create = function () { makeAllTextures(this); this.scene.start("Menu"); };',
    '',
    'function MenuScene() { Phaser.Scene.call(this, { key: "Menu" }); }',
    'MenuScene.prototype = Object.create(Phaser.Scene.prototype);',
    'MenuScene.prototype.constructor = MenuScene;',
    'MenuScene.prototype.create = function () {',
    '  this.add.text(CFG.W / 2, 60, "游戏标题", { fontFamily: "monospace", fontSize: "16px", color: "#3ecf8e" }).setOrigin(0.5);',
    '  this.add.text(CFG.W / 2, 100, "按空格或点击开始", { fontFamily: "monospace", fontSize: "8px", color: "#9aa3ad" }).setOrigin(0.5);',
    '  var s = this;',
    '  this.input.keyboard.once("keydown-SPACE", function () { U.clearSave(); s.scene.start("Game"); });',
    '  this.input.once("pointerdown", function () { U.clearSave(); s.scene.start("Game"); });',
    '};',
    '',
    'function GameScene() { Phaser.Scene.call(this, { key: "Game" }); }',
    'GameScene.prototype = Object.create(Phaser.Scene.prototype);',
    'GameScene.prototype.constructor = GameScene;',
    'GameScene.prototype.create = function () {',
    '  var s = this, i;',
    '  s.score = 0;',
    '  s.physics.world.setBounds(0, 0, CFG.WORLD_W, CFG.H);',
    '  s.cameras.main.setBounds(0, 0, CFG.WORLD_W, CFG.H);',
    '',
    '  // ===== 画面区（保留做法，内容按本次题材替换）=====',
    '  drawBackdrop(s, CFG.WORLD_W);',
    '  s.platforms = s.physics.add.staticGroup();',
    '  for (i = 0; i < CFG.WORLD_W / 32; i++) s.platforms.create(i * 32 + 16, CFG.H - 16, "tile");',
    '  for (i = 0; i < 10; i++) {',
    '    s.add.image(U.rand(60, CFG.WORLD_W - 60), CFG.H - 32, "tree").setOrigin(0.5, 1);',
    '  }',
    '  // ===== 画面区结束 =====',
    '',
    '  s.player = s.physics.add.sprite(80, CFG.H - 80, "hero0");',
    '  s.player.body.setCollideWorldBounds(true);',
    '  s.physics.add.collider(s.player, s.platforms);',
    '  s.cameras.main.startFollow(s.player, true, 0.12, 0.12);',
    '  s.hud = s.add.text(4, 4, "SCORE 0", { fontFamily: "monospace", fontSize: "8px", color: "#e8eaed" }).setScrollFactor(0).setDepth(100);',
    '  s.keys = s.input.keyboard.addKeys("LEFT,RIGHT,UP,DOWN,SPACE");',
    '  // ===== 玩法区：整体替换成本次需求的玩法 =====',
    '};',
    'GameScene.prototype.update = function () {',
    '  if (!this.player) return;',
    '  var k = this.keys, b = this.player.body;',
    '  b.setVelocityX(0);',
    '  if (k.LEFT.isDown) b.setVelocityX(-CFG.PLAYER_SPEED);',
    '  if (k.RIGHT.isDown) b.setVelocityX(CFG.PLAYER_SPEED);',
    '};',
    '',
    'function PauseScene() { Phaser.Scene.call(this, { key: "Pause" }); }',
    'PauseScene.prototype = Object.create(Phaser.Scene.prototype);',
    'PauseScene.prototype.constructor = PauseScene;',
    'PauseScene.prototype.create = function () {',
    '  this.add.rectangle(CFG.W / 2, CFG.H / 2, CFG.W, CFG.H, 0x000000, 0.65);',
    '  this.add.text(CFG.W / 2, CFG.H / 2, "已暂停（ESC 继续）", { fontFamily: "monospace", fontSize: "10px", color: "#3ecf8e" }).setOrigin(0.5);',
    '  var s = this;',
    '  this.input.keyboard.once("keydown-ESC", function () { s.scene.stop(); s.scene.resume("Game"); });',
    '};',
    '',
    'function OverScene() { Phaser.Scene.call(this, { key: "Over" }); }',
    'OverScene.prototype = Object.create(Phaser.Scene.prototype);',
    'OverScene.prototype.constructor = OverScene;',
    'OverScene.prototype.init = function (d) { this.finalScore = (d && d.score) || 0; };',
    'OverScene.prototype.create = function () {',
    '  var best = parseInt(localStorage.getItem("game_best") || "0", 10) || 0;',
    '  if (this.finalScore > best) { best = this.finalScore; localStorage.setItem("game_best", String(best)); }',
    '  this.add.rectangle(CFG.W / 2, CFG.H / 2, CFG.W, CFG.H, 0x000000, 0.72);',
    '  this.add.text(CFG.W / 2, CFG.H / 2 - 14, "GAME OVER", { fontFamily: "monospace", fontSize: "16px", color: "#e05252" }).setOrigin(0.5);',
    '  this.add.text(CFG.W / 2, CFG.H / 2 + 8, "得分 " + this.finalScore + " 最高 " + best, { fontFamily: "monospace", fontSize: "8px", color: "#e8eaed" }).setOrigin(0.5);',
    '  var s = this;',
    '  this.input.keyboard.once("keydown-SPACE", function () { s.scene.start("Game"); });',
    '  this.input.once("pointerdown", function () { s.scene.start("Game"); });',
    '};',
    '',
    '===== 文件：js/main.js =====',
    '// 只负责启动引擎，不放游戏逻辑',
    'var game = new Phaser.Game({',
    '  type: Phaser.AUTO,',
    '  parent: "game",',
    '  width: CFG.W, height: CFG.H,',
    '  backgroundColor: "#0b0d0f",',
    '  pixelArt: true,',
    '  physics: { default: "arcade", arcade: { gravity: { y: CFG.GRAVITY }, debug: false } },',
    '  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },',
    '  scene: [BootScene, MenuScene, GameScene, PauseScene, OverScene]',
    '});'
  ].join('\n');


  // ---------------------------------------------------------------------------
  // Phaser 底座（单文件，可直接跑）
  // ---------------------------------------------------------------------------
  var PHASER_SKELETON = [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">',
    '<title>游戏</title>',
    '<style>',
    '  html,body{margin:0;height:100%;background:#0b0d0f;overflow:hidden;}',
    '  #game{width:100%;height:100%;}',
    '  canvas{display:block;image-rendering:pixelated;}',
    '</style>',
    '</head>',
    '<body>',
    '<div id="game"></div>',
    phaserTags(),
    '<script>',
    '/* ==================== ① 配置（改这里调手感） ==================== */',
    'var CFG = {',
    '  W: 480, H: 270,          // 逻辑分辨率',
    '  PLAYER_SPEED: 140,',
    '  SAVE_KEY: "ember_save"',
    '};',
    '',
    '/* ==================== ② 通用工具（任何玩法都能用） ==================== */',
    'var U = {',
    '  // 现场生成一张纯色贴图（代替外部图片）',
    '  tex: function (scene, key, w, h, color) {',
    '    if (scene.textures.exists(key)) return;',
    '    var g = scene.make.graphics({ x: 0, y: 0, add: false });',
    '    g.fillStyle(color, 1);',
    '    g.fillRect(0, 0, w, h);',
    '    g.generateTexture(key, w, h);',
    '    g.destroy();',
    '  },',
    '  rand: function (a, b) { return Phaser.Math.Between(a, b); },',
    '  clamp: function (v, a, b) { return Phaser.Math.Clamp(v, a, b); },',
    '  dist: function (a, b) { return Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y); },',
    '  // 存档 / 读档（任何游戏都通用）',
    '  save: function (data) { try { localStorage.setItem(CFG.SAVE_KEY, JSON.stringify(data)); } catch (e) {} },',
    '  load: function () { try { return JSON.parse(localStorage.getItem(CFG.SAVE_KEY) || "null"); } catch (e) { return null; } },',
    '  clearSave: function () { try { localStorage.removeItem(CFG.SAVE_KEY); } catch (e) {} },',
    '  // 音效（WebAudio 合成，不依赖音频文件）',
    '  beep: function (freq, dur, type) {',
    '    try {',
    '      if (!window.__actx) window.__actx = new (window.AudioContext || window.webkitAudioContext)();',
    '      var a = window.__actx, o = a.createOscillator(), g = a.createGain();',
    '      o.type = type || "square"; o.frequency.value = freq;',
    '      g.gain.value = 0.04; o.connect(g); g.connect(a.destination);',
    '      o.start(); o.stop(a.currentTime + (dur || 0.08));',
    '    } catch (e) {}',
    '  }',
    '};',
    '',
    '/* ==================== ②-b 像素绘制工具（真像素风只允许用这三个） ==================== */',
    'var PX = {',
    '  // 直角矩形：像素画唯一的基础单位',
    '  rect: function (g, x, y, w, h, color) {',
    '    g.fillStyle(color, 1);',
    '    g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));',
    '  },',
    '  // 像素圆：逐行用矩形拼出来，边缘是硬的（不是矢量抗锯齿）',
    '  circle: function (g, cx, cy, r, color) {',
    '    cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);',
    '    g.fillStyle(color, 1);',
    '    for (var yy = -r; yy <= r; yy++) {',
    '      var dx = Math.floor(Math.sqrt(r * r - yy * yy));',
    '      g.fillRect(cx - dx, cy + yy, dx * 2 + 1, 1);',
    '    }',
    '  },',
    '  // 棋盘抖动：老主机用来做渐变/半透明的土办法',
    '  dither: function (g, x, y, w, h, color, step) {',
    '    step = step || 2;',
    '    g.fillStyle(color, 1);',
    '    for (var yy2 = 0; yy2 < h; yy2 += step) {',
    '      for (var xx2 = 0; xx2 < w; xx2 += step) {',
    '        if ((xx2 / step + yy2 / step) % 2 === 0) {',
    '          g.fillRect(Math.round(x + xx2), Math.round(y + yy2), 1, 1);',
    '        }',
    '      }',
    '    }',
    '  }',
    '};',
    '',
    '/* ==================== ③ 引擎初始化 ==================== */',
    'var game = new Phaser.Game({',
    '  type: Phaser.AUTO,',
    '  parent: "game",',
    '  width: CFG.W, height: CFG.H,',
    '  backgroundColor: "#0b0d0f",',
    '  pixelArt: true,',
    '  physics: { default: "arcade", arcade: { gravity: { y: 0 }, debug: false } },',
    '  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },',
    '  scene: [BootScene, MenuScene, GameScene, PauseScene, OverScene]',
    '});',
    '',
    '/* ==================== ④ Boot：预生成贴图 + 读档 ==================== */',
    'function BootScene() { Phaser.Scene.call(this, { key: "Boot" }); }',
    'BootScene.prototype = Object.create(Phaser.Scene.prototype);',
    'BootScene.prototype.constructor = BootScene;',
    'BootScene.prototype.create = function () {',
    '  // 这里统一生成本作用到的贴图，玩法要什么就加什么',
    '  U.tex(this, "player", 12, 12, 0x3ecf8e);',
    '  U.tex(this, "enemy", 10, 10, 0xe05252);',
    '  U.tex(this, "pickup", 8, 8, 0xf5c542);',
    '  this.saveData = U.load();',
    '  this.scene.start("Menu");',
    '};',
    '',
    '/* ==================== ⑤ Menu：新游戏 / 继续 ==================== */',
    'function MenuScene() { Phaser.Scene.call(this, { key: "Menu" }); }',
    'MenuScene.prototype = Object.create(Phaser.Scene.prototype);',
    'MenuScene.prototype.constructor = MenuScene;',
    'MenuScene.prototype.create = function () {',
    '  var hasSave = !!(this.scene.settings && window.__hasSave);',
    '  this.add.text(CFG.W / 2, 70, "游戏标题", { fontFamily: "monospace", fontSize: "20px", color: "#3ecf8e" }).setOrigin(0.5);',
    '  this.add.text(CFG.W / 2, 110, "操作说明写在这里", { fontFamily: "monospace", fontSize: "9px", color: "#9aa3ad" }).setOrigin(0.5);',
    '  this.add.text(CFG.W / 2, 150, "按空格或点击开始", { fontFamily: "monospace", fontSize: "10px", color: "#e8eaed" }).setOrigin(0.5);',
    '  var s = this;',
    '  this.input.keyboard.once("keydown-SPACE", function () { U.clearSave(); s.scene.start("Game"); });',
    '  this.input.once("pointerdown", function () { U.clearSave(); s.scene.start("Game"); });',
    '};',
    '',
    '/* ==================== ⑥ Game：底座 + 玩法区 ==================== */',
    'function GameScene() { Phaser.Scene.call(this, { key: "Game" }); }',
    'GameScene.prototype = Object.create(Phaser.Scene.prototype);',
    'GameScene.prototype.constructor = GameScene;',
    'GameScene.prototype.create = function () {',
    '  var s = this;',
    '  s.score = 0;',
    '  s.isOver = false;',
    '',
    '  // --- 底座：HUD ---',
    '  s.hud = s.add.text(6, 4, "SCORE 0", { fontFamily: "monospace", fontSize: "10px", color: "#e8eaed" }).setScrollFactor(0);',
    '',
    '  // --- 底座：摄像机跟随（大地图/无限地图必需） ---',
    '  s.cameras.main.setBounds(-2000, -2000, 4000, 4000);',
    '',
    '  // --- 底座：输入（键盘 + 触屏方向） ---',
    '  s.keys = s.input.keyboard.addKeys("UP,DOWN,LEFT,RIGHT,W,A,S,D");',
    '',
    '  // --- 底座：暂停 ---',
    '  s.input.keyboard.on("keydown-ESC", function () {',
    '    if (s.isOver) return;',
    '    s.scene.pause();',
    '    s.scene.launch("Pause");',
    '  });',
    '',
    '  // ==================== 玩法区开始（整段可替换） ====================',
    '  // 下面只是演示如何调用底座：移动 + 吃小方块变大。做你的游戏时请**整段删掉重写**。',
    '  s.player = s.physics.add.sprite(CFG.W / 2, CFG.H / 2, "player");',
    '  s.player.body.setCircle(6);',
    '  s.cameras.main.startFollow(s.player, true, 0.1, 0.1);',
    '  s.scoreText = s.add.text(0, 0, "", { fontFamily: "monospace", fontSize: "10px", color: "#f5c542" });',
    '  s.food = s.physics.add.group();',
    '  s.time.addEvent({ delay: 500, loop: true, callback: function () {',
    '    var x = s.player.x + U.rand(-260, 260);',
    '    var y = s.player.y + U.rand(-160, 160);',
    '    s.food.create(x, y, "pickup");',
    '  }});',
    '  s.physics.add.overlap(s.player, s.food, function (p, f) {',
    '    f.destroy();',
    '    s.score += 1;',
    '    p.setScale(p.scale + 0.03);',
    '    s.hud.setText("SCORE " + s.score);',
    '    U.beep(760, 0.05);',
    '  });',
    '  // ==================== 玩法区结束 ====================',
    '',
    '  // --- 底座：存档接口（有进度时调用） ---',
    '  s.saveGame = function () { U.save({ score: s.score, x: s.player.x, y: s.player.y }); };',
    '  s.time.addEvent({ delay: 5000, loop: true, callback: s.saveGame });',
    '};',
    '',
    'GameScene.prototype.update = function () {',
    '  if (this.isOver || !this.player) return;',
    '  var v = CFG.PLAYER_SPEED, k = this.keys;',
    '  var b = this.player.body;',
    '  b.setVelocity(0, 0);',
    '  if (k.LEFT.isDown || k.A.isDown) b.setVelocityX(-v);',
    '  if (k.RIGHT.isDown || k.D.isDown) b.setVelocityX(v);',
    '  if (k.UP.isDown || k.W.isDown) b.setVelocityY(-v);',
    '  if (k.DOWN.isDown || k.S.isDown) b.setVelocityY(v);',
    '};',
    '',
    '/* ==================== ⑦ Pause：暂停层 ==================== */',
    'function PauseScene() { Phaser.Scene.call(this, { key: "Pause" }); }',
    'PauseScene.prototype = Object.create(Phaser.Scene.prototype);',
    'PauseScene.prototype.constructor = PauseScene;',
    'PauseScene.prototype.create = function () {',
    '  this.add.rectangle(CFG.W / 2, CFG.H / 2, CFG.W, CFG.H, 0x000000, 0.65);',
    '  this.add.text(CFG.W / 2, CFG.H / 2 - 8, "已暂停", { fontFamily: "monospace", fontSize: "16px", color: "#3ecf8e" }).setOrigin(0.5);',
    '  this.add.text(CFG.W / 2, CFG.H / 2 + 14, "按 ESC 继续", { fontFamily: "monospace", fontSize: "9px", color: "#9aa3ad" }).setOrigin(0.5);',
    '  var s = this;',
    '  this.input.keyboard.once("keydown-ESC", function () {',
    '    s.scene.stop();',
    '    s.scene.resume("Game");',
    '  });',
    '};',
    '',
    '/* ==================== ⑧ Over：结算 ==================== */',
    'function OverScene() { Phaser.Scene.call(this, { key: "Over" }); }',
    'OverScene.prototype = Object.create(Phaser.Scene.prototype);',
    'OverScene.prototype.constructor = OverScene;',
    'OverScene.prototype.init = function (data) {',
    '  this.finalScore = (data && data.score) || 0;',
    '};',
    'OverScene.prototype.create = function () {',
    '  var best = parseInt(localStorage.getItem("ember_best") || "0", 10) || 0;',
    '  if (this.finalScore > best) { best = this.finalScore; localStorage.setItem("ember_best", String(best)); }',
    '  this.add.rectangle(CFG.W / 2, CFG.H / 2, CFG.W, CFG.H, 0x000000, 0.72);',
    '  this.add.text(CFG.W / 2, CFG.H / 2 - 24, "GAME OVER", { fontFamily: "monospace", fontSize: "18px", color: "#e05252" }).setOrigin(0.5);',
    '  this.add.text(CFG.W / 2, CFG.H / 2 + 2, "得分 " + this.finalScore + "  ·  最高 " + best, { fontFamily: "monospace", fontSize: "10px", color: "#e8eaed" }).setOrigin(0.5);',
    '  this.add.text(CFG.W / 2, CFG.H / 2 + 26, "按空格或点击重开", { fontFamily: "monospace", fontSize: "9px", color: "#9aa3ad" }).setOrigin(0.5);',
    '  var s = this;',
    '  this.input.keyboard.once("keydown-SPACE", function () { s.scene.start("Game"); });',
    '  this.input.once("pointerdown", function () { s.scene.start("Game"); });',
    '};',
    '<\/script>',
    '</body>',
    '</html>'
  ].join('\n');

  // ---------------------------------------------------------------------------
  // ★ v2 底座：画面密度更高的示例场景
  //
  //   为什么要重写：模型会「锚定」在底座给出的画面上。
  //   旧底座示例是纯色方块 → 模型学到的就是纯色方块。
  //   新底座给的是一个有调色板、有纹理地面、三层视差、装饰物、粒子、角色动画的场景。
  //
  //   结构上分成两段：
  //     「画面区」——保留，这是底座提供的画面质量，允许扩展，不允许删减
  //     「玩法区」——整段替换成本次需求的玩法
  // ---------------------------------------------------------------------------
  var RICH_SKELETON = [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">',
    '<title>游戏</title>',
    '<style>',
    '  html,body{margin:0;height:100%;background:#0b0d0f;overflow:hidden;}',
    '  #game{width:100%;height:100%;}',
    '  canvas{display:block;image-rendering:pixelated;}',
    '</style>',
    '</head>',
    '<body>',
    '<div id="game"></div>',
    phaserTags(),
    '<script>',
    '/* ==================== ① 配置 ==================== */',
    'var CFG = {',
    '  W: {{W}}, H: {{H}},',
    '  WORLD_W: 1600,',
    '  PLAYER_SPEED: 110,',
    '  GRAVITY: 900,',
    '  JUMP: -290,',
    '  SAVE_KEY: "ember_save"',
    '};',
    '',
    '/* ==================== ② 调色板（像素风必须固定色板，后面只用这些颜色） ==================== */',
    '/* 本档位色板要求：{{PALETTE_HINT}} */',
    'var ART = {',
    '  skyTop: 0x141a33, skyMid: 0x1d2445, skyLow: 0x2a3258,',
    '  farHill: 0x11162a, midHill: 0x1a2038,',
    '  grassTop: 0x74b06a, grassMid: 0x4a7c59, grassDark: 0x33553d,',
    '  dirt: 0x3a2f22, dirtDark: 0x2a2118, pebble: 0x4a4a52,',
    '  trunk: 0x5a3f28, leaf1: 0x2f5d3a, leaf2: 0x3f7a49, leaf3: 0x559a5c,',
    '  skin: 0xf0c090, armor: 0xc8d2dc, armorDark: 0x8e99a6, eye: 0x1a1a24,',
    '  steel: 0xb0b8c4, gold: 0xf5c542, ui: 0xe8eaed, uiDim: 0x9aa3ad',
    '};',
    '',
    '/* ==================== ③ 工具 ==================== */',
    'var U = {',
    '  rand: function (a, b) { return Phaser.Math.Between(a, b); },',
    '  save: function (d) { try { localStorage.setItem(CFG.SAVE_KEY, JSON.stringify(d)); } catch (e) {} },',
    '  load: function () { try { return JSON.parse(localStorage.getItem(CFG.SAVE_KEY) || "null"); } catch (e) { return null; } },',
    '  clearSave: function () { try { localStorage.removeItem(CFG.SAVE_KEY); } catch (e) {} },',
    '  beep: function (freq, dur, type) {',
    '    try {',
    '      if (!window.__actx) window.__actx = new (window.AudioContext || window.webkitAudioContext)();',
    '      var a = window.__actx, o = a.createOscillator(), g = a.createGain();',
    '      o.type = type || "square"; o.frequency.value = freq; g.gain.value = 0.04;',
    '      o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + (dur || 0.08));',
    '    } catch (e) {}',
    '  }',
    '};',
    'var PX = {',
    '  rect: function (g, x, y, w, h, c) { g.fillStyle(c, 1); g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); },',
    '  circle: function (g, cx, cy, r, c) {',
    '    cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r); g.fillStyle(c, 1);',
    '    for (var yy = -r; yy <= r; yy++) {',
    '      var dx = Math.floor(Math.sqrt(r * r - yy * yy));',
    '      g.fillRect(cx - dx, cy + yy, dx * 2 + 1, 1);',
    '    }',
    '  },',
    '  dither: function (g, x, y, w, h, c, step) {',
    '    step = step || 2; g.fillStyle(c, 1);',
    '    for (var yy = 0; yy < h; yy += step) {',
    '      for (var xx = 0; xx < w; xx += step) {',
    '        if ((xx / step + yy / step) % 2 === 0) g.fillRect(Math.round(x + xx), Math.round(y + yy), 1, 1);',
    '      }',
    '    }',
    '  }',
    '};',
    '',
    '/* ==================== ④ 贴图生成（全部代码画，零外部图片） ==================== */',
    'function drawHero(g, pose) {',
    '  var l1 = pose === 1 ? 7 : 4, l2 = pose === 2 ? 7 : 9;',
    '  PX.rect(g, l1, 16, 3, 8, ART.armorDark);',
    '  PX.rect(g, l2, 16, 3, 8, ART.armorDark);',
    '  PX.rect(g, 3, 8, 10, 9, ART.armor);',
    '  PX.rect(g, 3, 8, 10, 2, ART.armorDark);',
    '  PX.rect(g, 3, 15, 10, 2, ART.armorDark);',
    '  PX.rect(g, 4, 2, 8, 7, ART.skin);',
    '  PX.rect(g, 3, 0, 10, 4, ART.armor);',
    '  PX.rect(g, 3, 0, 10, 1, 0xffffff);',
    '  PX.rect(g, 5, 4, 1, 2, ART.eye);',
    '  PX.rect(g, 10, 4, 1, 2, ART.eye);',
    '  PX.rect(g, 13, 6, 2, 9, ART.steel);',
    '  PX.rect(g, 12, 14, 4, 2, ART.trunk);',
    '}',
    'function makeTextures(scene) {',
    '  var g, i, x, y;',
    '  // 地面 32×32：泥土层 + 石子 + 草皮（上 7px）',
    '  g = scene.make.graphics({ x: 0, y: 0, add: false });',
    '  PX.rect(g, 0, 0, 32, 32, ART.dirt);',
    '  for (i = 0; i < 9; i++) PX.rect(g, U.rand(1, 29), U.rand(9, 30), 2, 2, ART.dirtDark);',
    '  for (i = 0; i < 3; i++) PX.rect(g, U.rand(1, 27), U.rand(12, 28), 3, 2, ART.pebble);',
    '  PX.rect(g, 0, 0, 32, 7, ART.grassMid);',
    '  PX.rect(g, 0, 0, 32, 3, ART.grassTop);',
    '  PX.rect(g, 0, 7, 32, 1, ART.grassDark);',
    '  for (i = 0; i < 7; i++) { x = U.rand(0, 31); PX.rect(g, x, 0, 1, U.rand(2, 5), ART.grassTop); }',
    '  g.generateTexture("tile", 32, 32); g.destroy();',
    '',
    '  // 树 34×54',
    '  g = scene.make.graphics({ x: 0, y: 0, add: false });',
    '  PX.rect(g, 14, 30, 6, 24, ART.trunk);',
    '  PX.rect(g, 14, 30, 2, 24, 0x6b4c31);',
    '  PX.circle(g, 17, 24, 15, ART.leaf1);',
    '  PX.circle(g, 11, 20, 9, ART.leaf2);',
    '  PX.circle(g, 23, 21, 9, ART.leaf2);',
    '  PX.circle(g, 15, 16, 6, ART.leaf3);',
    '  PX.circle(g, 21, 18, 4, ART.leaf3);',
    '  g.generateTexture("tree", 34, 54); g.destroy();',
    '',
    '  // 灌木 22×12',
    '  g = scene.make.graphics({ x: 0, y: 0, add: false });',
    '  PX.circle(g, 7, 8, 5, ART.leaf1); PX.circle(g, 13, 9, 5, ART.leaf1); PX.circle(g, 10, 6, 5, ART.leaf2);',
    '  g.generateTexture("bush", 22, 12); g.destroy();',
    '',
    '  // 石头 16×10',
    '  g = scene.make.graphics({ x: 0, y: 0, add: false });',
    '  PX.circle(g, 8, 6, 6, ART.pebble); PX.rect(g, 2, 7, 12, 3, ART.pebble);',
    '  PX.rect(g, 5, 3, 3, 1, 0x66666f);',
    '  g.generateTexture("rock", 16, 10); g.destroy();',
    '',
    '  // 角色三帧 16×24',
    '  for (i = 0; i < 3; i++) {',
    '    g = scene.make.graphics({ x: 0, y: 0, add: false });',
    '    drawHero(g, i);',
    '    g.generateTexture("hero" + i, 16, 24); g.destroy();',
    '  }',
    '',
    '  // 金币 10×10',
    '  g = scene.make.graphics({ x: 0, y: 0, add: false });',
    '  PX.circle(g, 5, 5, 4, ART.gold);',
    '  PX.circle(g, 4, 4, 2, 0xffe680);',
    '  g.generateTexture("coin", 10, 10); g.destroy();',
    '',
    '  // 2×2 白点（粒子用）',
    '  g = scene.make.graphics({ x: 0, y: 0, add: false });',
    '  PX.rect(g, 0, 0, 2, 2, 0xffffff);',
    '  g.generateTexture("dot", 2, 2); g.destroy();',
    '}',
    '',
    '/* ==================== ⑤ 引擎初始化 ==================== */',
    'var game = new Phaser.Game({',
    '  type: Phaser.AUTO,',
    '  parent: "game",',
    '  width: CFG.W, height: CFG.H,',
    '  backgroundColor: "#141a33",',
    '  pixelArt: true,',
    '  physics: { default: "arcade", arcade: { gravity: { y: CFG.GRAVITY }, debug: false } },',
    '  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },',
    '  scene: [BootScene, MenuScene, GameScene, PauseScene, OverScene]',
    '});',
    '',
    '/* ==================== ⑥ Boot ==================== */',
    'function BootScene() { Phaser.Scene.call(this, { key: "Boot" }); }',
    'BootScene.prototype = Object.create(Phaser.Scene.prototype);',
    'BootScene.prototype.constructor = BootScene;',
    'BootScene.prototype.create = function () { makeTextures(this); this.scene.start("Menu"); };',
    '',
    '/* ==================== ⑦ Menu ==================== */',
    'function MenuScene() { Phaser.Scene.call(this, { key: "Menu" }); }',
    'MenuScene.prototype = Object.create(Phaser.Scene.prototype);',
    'MenuScene.prototype.constructor = MenuScene;',
    'MenuScene.prototype.create = function () {',
    '  var s = this;',
    '  // 菜单也铺一层画面：天空 + 远山剪影，避免纯色背景',
    '  var sky = s.add.graphics();',
    '  PX.rect(sky, 0, 0, CFG.W, CFG.H * 0.55, ART.skyTop);',
    '  PX.rect(sky, 0, CFG.H * 0.55, CFG.W, CFG.H * 0.2, ART.skyMid);',
    '  PX.rect(sky, 0, CFG.H * 0.75, CFG.W, CFG.H * 0.25, ART.skyLow);',
    '  for (var i = 0; i < 26; i++) PX.rect(sky, U.rand(0, CFG.W), U.rand(4, CFG.H * 0.5), 1, 1, 0xffffff);',
    '  var hills = s.add.graphics();',
    '  for (var h = 0; h < 9; h++) {',
    '    var hx = h * 40 - 10;',
    '    PX.circle(hills, hx + 20, CFG.H * 0.78, U.rand(18, 30), ART.midHill);',
    '  }',
    '  PX.rect(hills, 0, CFG.H * 0.82, CFG.W, CFG.H * 0.18, ART.grassDark);',
    '  PX.rect(hills, 0, CFG.H * 0.82, CFG.W, 2, ART.grassMid);',
    '  s.add.text(CFG.W / 2, 74, "游戏标题", { fontFamily: "monospace", fontSize: "22px", color: "#e8eaed" }).setOrigin(0.5);',
    '  s.add.text(CFG.W / 2, 104, "方向键 / WASD 移动　空格跳跃", { fontFamily: "monospace", fontSize: "8px", color: "#9aa3ad" }).setOrigin(0.5);',
    '  s.add.text(CFG.W / 2, 150, "按空格或点击开始", { fontFamily: "monospace", fontSize: "10px", color: "#f5c542" }).setOrigin(0.5);',
    '  s.input.keyboard.once("keydown-SPACE", function () { U.clearSave(); s.scene.start("Game"); });',
    '  s.input.once("pointerdown", function () { U.clearSave(); s.scene.start("Game"); });',
    '};',
    '',
    '/* ==================== ⑧ Game ==================== */',
    'function GameScene() { Phaser.Scene.call(this, { key: "Game" }); }',
    'GameScene.prototype = Object.create(Phaser.Scene.prototype);',
    'GameScene.prototype.constructor = GameScene;',
    'GameScene.prototype.create = function () {',
    '  var s = this, i;',
    '  s.score = 0;',
    '  s.physics.world.setBounds(0, 0, CFG.WORLD_W, CFG.H);',
    '  s.cameras.main.setBounds(0, 0, CFG.WORLD_W, CFG.H);',
    '  s.cameras.main.setBackgroundColor(ART.skyTop);',
    '',
    '  // ===== 画面区（保留做法，内容按本次题材替换）=====',
    '  // 远景：城镇剪影（屋身 + 三角屋顶 + 窗光，避免大色块造成的"方框感"）',
    '  var bgFar = s.add.graphics().setScrollFactor(0.15);',
    '  var farW = CFG.WORLD_W * 0.15 + CFG.W;',
    '  var farBase = CFG.H * 0.8;',
    '  PX.rect(bgFar, 0, farBase, farW, CFG.H - farBase, ART.farHill);',
    '  for (i = 0; i < farW / 52 + 1; i++) {',
    '    var bx = Math.round(i * 52 + U.rand(0, 12));',
    '    var bw = U.rand(20, 34), bh = U.rand(26, 56), by = farBase - bh;',
    '    PX.rect(bgFar, bx, by, bw, bh, ART.farHill);',
    '    for (var rh = 0; rh < 9; rh++) {',
    '      var rw = Math.round(bw * (1 - rh / 9));',
    '      PX.rect(bgFar, bx + Math.round((bw - rw) / 2), by - rh - 1, rw, 1, ART.farHill);',
    '    }',
    '    for (var wy = 0; wy < Math.floor(bh / 15); wy++) {',
    '      for (var wx2 = 0; wx2 < Math.floor(bw / 11); wx2++) {',
    '        if ((i + wy + wx2) % 3 === 0) continue;',
    '        PX.rect(bgFar, bx + 5 + wx2 * 11, by + 9 + wy * 15, 3, 4, ART.gold);',
    '      }',
    '    }',
    '  }',
    '',
    '  // 中景：树林剪影（间距和高度都要随机，否则会像一排栅栏）',
    '  var bgMid = s.add.graphics().setScrollFactor(0.35);',
    '  var midW = CFG.WORLD_W * 0.35 + CFG.W;',
    '  PX.rect(bgMid, 0, CFG.H * 0.84, midW, CFG.H * 0.16, ART.midHill);',
    '  var mx = 4;',
    '  while (mx < midW) {',
    '    var th = U.rand(16, 36);',
    '    PX.rect(bgMid, mx + 3, CFG.H * 0.84 - th, 3, th, ART.midHill);',
    '    PX.circle(bgMid, mx + 4, CFG.H * 0.84 - th - 4, U.rand(5, 10), ART.midHill);',
    '    if (U.rand(0, 2) === 0) PX.circle(bgMid, mx - 2, CFG.H * 0.84 - 5, U.rand(3, 6), ART.midHill);',
    '    mx += U.rand(16, 52);',
    '  }',
    '',
    '  // 近景：草坡',
    '  var bgNear = s.add.graphics().setScrollFactor(0.62);',
    '  var nearW = CFG.WORLD_W * 0.62 + CFG.W;',
    '  PX.rect(bgNear, 0, CFG.H * 0.9, nearW, CFG.H * 0.1, ART.grassDark);',
    '  for (i = 0; i < nearW / 12; i++) PX.rect(bgNear, i * 12 + U.rand(0, 4), CFG.H * 0.9 - 3, 2, 3, ART.grassMid);',
    '',
    '  // 地面（地砖，带纹理）',
    '  s.platforms = s.physics.add.staticGroup();',
    '  for (i = 0; i < CFG.WORLD_W / 32; i++) {',
    '    s.platforms.create(i * 32 + 16, CFG.H - 16, "tile");',
    '  }',
    '',
    '  // 半空平台（带高光/阴影边缘）',
    '  function addPlatform(px, py, len) {',
    '    for (var j = 0; j < len; j++) s.platforms.create(px + j * 32 + 16, py, "tile");',
    '    var cap = s.add.graphics();',
    '    PX.rect(cap, px, py - 16, len * 32, 2, ART.grassTop);',
    '    PX.rect(cap, px, py + 14, len * 32, 2, ART.dirtDark);',
    '  }',
    '  addPlatform(180, 150, 3); addPlatform(430, 120, 4); addPlatform(760, 160, 3);',
    '  addPlatform(1050, 130, 5); addPlatform(1320, 155, 3);',
    '',
    '  // 装饰（树 / 灌木 / 石头），成组摆放',
    '  var decoX = [90, 240, 380, 560, 700, 880, 1020, 1180, 1310, 1450];',
    '  for (i = 0; i < decoX.length; i++) {',
    '    if (i % 3 === 0) s.add.image(decoX[i], CFG.H - 32, "tree").setOrigin(0.5, 1);',
    '    else if (i % 3 === 1) s.add.image(decoX[i], CFG.H - 32, "bush").setOrigin(0.5, 1);',
    '    else s.add.image(decoX[i], CFG.H - 32, "rock").setOrigin(0.5, 1);',
    '  }',
    '  for (i = 0; i < 18; i++) {',
    '    s.add.image(U.rand(20, CFG.WORLD_W - 20), CFG.H - 32, "bush").setOrigin(0.5, 1).setAlpha(0.9);',
    '  }',
    '',
    '  // 漂浮尘埃粒子',
    '  s.add.particles(0, 0, "dot", {',
    '    x: { min: 0, max: CFG.WORLD_W }, y: { min: 40, max: CFG.H - 40 },',
    '    lifespan: 4200, speedY: { min: -8, max: -3 }, speedX: { min: -4, max: 4 },',
    '    scale: { start: 1, end: 0 }, alpha: { start: 0.5, end: 0 },',
    '    tint: [0x9fd6ff, 0xfff0a0], blendMode: "ADD", frequency: 90, quantity: 1',
    '  });',
    '',
    '  // 玩家',
    '  s.player = s.physics.add.sprite(80, CFG.H - 80, "hero0");',
    '  s.player.body.setSize(12, 22).setOffset(2, 2);',
    '  s.player.setCollideWorldBounds(true);',
    '  s.cameras.main.startFollow(s.player, true, 0.12, 0.12);',
    '  s.physics.add.collider(s.player, s.platforms);',
    '  s.keys = s.input.keyboard.addKeys("LEFT,RIGHT,UP,DOWN,A,D,W,S,SPACE");',
    '  // ===== 画面区结束 =====',
    '',
    '  // ===== 玩法区（整段替换成本次需求的玩法；演示：吃金币得分）=====',
    '  s.coins = s.physics.add.group();',
    '  for (i = 0; i < 8; i++) {',
    '    var c = s.coins.create(U.rand(100, CFG.WORLD_W - 100), U.rand(80, CFG.H - 80), "coin");',
    '    c.body.setAllowGravity(false);',
    '  }',
    '  s.physics.add.overlap(s.player, s.coins, function (p, coin) {',
    '    coin.destroy(); s.score += 10; s.hud.setText("SCORE " + s.score); U.beep(760, 0.06);',
    '  });',
    '  // ===== 玩法区结束 =====',
    '',
    '  // HUD（永远在最上层，不随镜头移动）',
    '  s.hud = s.add.text(6, 6, "SCORE 0", { fontFamily: "monospace", fontSize: "9px", color: "#e8eaed" }).setScrollFactor(0).setDepth(100);',
    '  s.input.keyboard.on("keydown-ESC", function () { if (s.scene.isActive()) { s.scene.pause(); s.scene.launch("Pause"); } });',
    '};',
    '',
    'GameScene.prototype.update = function () {',
    '  if (!this.player) return;',
    '  var b = this.player.body, k = this.keys, v = CFG.PLAYER_SPEED;',
    '  b.setVelocityX(0);',
    '  if (k.LEFT.isDown || k.A.isDown) { b.setVelocityX(-v); this.player.setFlipX(true); }',
    '  if (k.RIGHT.isDown || k.D.isDown) { b.setVelocityX(v); this.player.setFlipX(false); }',
    '  if ((k.UP.isDown || k.W.isDown || k.SPACE.isDown) && b.touching.down) b.setVelocityY(CFG.JUMP);',
    '  // 走路时轮换三帧（站立用第 0 帧）',
    '  if (b.velocity.x !== 0 && b.touching.down) {',
    '    this.animT = (this.animT || 0) + 1;',
    '    this.player.setTexture(["hero1", "hero0", "hero2", "hero0"][Math.floor(this.animT / 6) % 4]);',
    '  } else {',
    '    this.player.setTexture("hero0");',
    '  }',
    '};',
    '',
    '/* ==================== ⑨ Pause ==================== */',
    'function PauseScene() { Phaser.Scene.call(this, { key: "Pause" }); }',
    'PauseScene.prototype = Object.create(Phaser.Scene.prototype);',
    'PauseScene.prototype.constructor = PauseScene;',
    'PauseScene.prototype.create = function () {',
    '  this.add.rectangle(CFG.W / 2, CFG.H / 2, CFG.W, CFG.H, 0x000000, 0.66);',
    '  this.add.text(CFG.W / 2, CFG.H / 2 - 8, "已暂停", { fontFamily: "monospace", fontSize: "16px", color: "#e8eaed" }).setOrigin(0.5);',
    '  this.add.text(CFG.W / 2, CFG.H / 2 + 14, "按 ESC 继续", { fontFamily: "monospace", fontSize: "9px", color: "#9aa3ad" }).setOrigin(0.5);',
    '  var s = this;',
    '  this.input.keyboard.once("keydown-ESC", function () { s.scene.stop(); s.scene.resume("Game"); });',
    '};',
    '',
    '/* ==================== ⑩ Over ==================== */',
    'function OverScene() { Phaser.Scene.call(this, { key: "Over" }); }',
    'OverScene.prototype = Object.create(Phaser.Scene.prototype);',
    'OverScene.prototype.constructor = OverScene;',
    'OverScene.prototype.init = function (d) { this.finalScore = (d && d.score) || 0; };',
    'OverScene.prototype.create = function () {',
    '  var best = parseInt(localStorage.getItem("ember_best") || "0", 10) || 0;',
    '  if (this.finalScore > best) { best = this.finalScore; localStorage.setItem("ember_best", String(best)); }',
    '  this.add.rectangle(CFG.W / 2, CFG.H / 2, CFG.W, CFG.H, 0x000000, 0.74);',
    '  this.add.text(CFG.W / 2, CFG.H / 2 - 22, "GAME OVER", { fontFamily: "monospace", fontSize: "18px", color: "#e05252" }).setOrigin(0.5);',
    '  this.add.text(CFG.W / 2, CFG.H / 2 + 2, "得分 " + this.finalScore + "　最高 " + best, { fontFamily: "monospace", fontSize: "9px", color: "#e8eaed" }).setOrigin(0.5);',
    '  this.add.text(CFG.W / 2, CFG.H / 2 + 24, "按空格或点击重开", { fontFamily: "monospace", fontSize: "9px", color: "#9aa3ad" }).setOrigin(0.5);',
    '  var s = this;',
    '  this.input.keyboard.once("keydown-SPACE", function () { s.scene.start("Game"); });',
    '  this.input.once("pointerdown", function () { s.scene.start("Game"); });',
    '};',
    '<\/script>',
    '</body>',
    '</html>'
  ].join('\n');

  // 用新底座覆盖旧版（旧版保留在文件里作为参考，不再使用）
  PHASER_SKELETON = RICH_SKELETON;

  // ---------------------------------------------------------------------------
  // Canvas 底座（零依赖备选）
  // ---------------------------------------------------------------------------
  var CANVAS_SKELETON = [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">',
    '<title>小游戏</title>',
    '<style>',
    '  html,body{margin:0;height:100%;background:#0b0d0f;overflow:hidden;}',
    '  canvas{display:block;width:100%;height:100%;image-rendering:pixelated;}',
    '</style>',
    '</head>',
    '<body>',
    '<canvas id="cv"></canvas>',
    '<script>',
    '(function(){',
    '  "use strict";',
    '  var W = 320, H = 180;',
    '  var cv = document.getElementById("cv"), ctx = cv.getContext("2d");',
    '  ctx.imageSmoothingEnabled = false;',
    '  function fit(){',
    '    var s = Math.max(1, Math.floor(Math.min(innerWidth / W, innerHeight / H)));',
    '    cv.width = W; cv.height = H;',
    '    cv.style.width = (W*s)+"px"; cv.style.height = (H*s)+"px";',
    '    cv.style.marginLeft = Math.floor((innerWidth - W*s)/2)+"px";',
    '    cv.style.marginTop = Math.floor((innerHeight - H*s)/2)+"px";',
    '  }',
    '  addEventListener("resize", fit); fit();',
    '',
    '  var STATE = { READY:0, PLAYING:1, OVER:2 }, state = STATE.READY;',
    '  var score = 0, best = parseInt(localStorage.getItem("game_best")||"0",10)||0;',
    '  var keys = {};',
    '  addEventListener("keydown", function(e){ keys[e.key]=true; if(e.key===" "||e.key==="Enter"){e.preventDefault();action();} });',
    '  addEventListener("keyup", function(e){ keys[e.key]=false; });',
    '  cv.addEventListener("pointerdown", action);',
    '  function action(){ if(state!==STATE.PLAYING) reset(); }',
    '',
    '  // ============ 玩法区（整段可替换）============',
    '  var player = { x:W/2-5, y:H-32, w:10, h:14 };',
    '  var items = [], hazards = [], spawnTimer = 0;',
    '  function reset(){ state=STATE.PLAYING; score=0; items=[]; hazards=[]; spawnTimer=0; player.x=W/2-5; player.y=H-32; }',
    '  function hit(a,b){ return a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y; }',
    '  function update(dt){',
    '    if(state!==STATE.PLAYING) return;',
    '    var v = 130;',
    '    if(keys.ArrowLeft||keys.a||keys.A) player.x -= v*dt;',
    '    if(keys.ArrowRight||keys.d||keys.D) player.x += v*dt;',
    '    if(keys.ArrowUp||keys.w||keys.W) player.y -= v*dt;',
    '    if(keys.ArrowDown||keys.s||keys.S) player.y += v*dt;',
    '    player.x = Math.max(0, Math.min(W-player.w, player.x));',
    '    player.y = Math.max(0, Math.min(H-player.h, player.y));',
    '    spawnTimer -= dt;',
    '    if(spawnTimer<=0){ spawnTimer=0.7; var x=Math.random()*(W-12);',
    '      if(Math.random()<0.7) items.push({x:x,y:-12,w:8,h:8}); else hazards.push({x:x,y:-12,w:12,h:12}); }',
    '    items.forEach(function(o){ o.y += 60*dt; });',
    '    hazards.forEach(function(o){ o.y += 75*dt; });',
    '    for(var i=items.length-1;i>=0;i--){',
    '      if(hit(player,items[i])){ items.splice(i,1); score+=10; beep(880,0.05); }',
    '      else if(items[i].y>H) items.splice(i,1);',
    '    }',
    '    for(var j=hazards.length-1;j>=0;j--){',
    '      if(hit(player,hazards[j])){ hazards.splice(j,1); gameOver(); }',
    '      else if(hazards[j].y>H) hazards.splice(j,1);',
    '    }',
    '  }',
    '  // ============ 玩法区结束 ============',
    '',
    '  function gameOver(){ state=STATE.OVER; beep(160,0.3,"sawtooth");',
    '    if(score>best){ best=score; localStorage.setItem("game_best", String(best)); } }',
    '',
    '  var actx = null;',
    '  function beep(freq,dur,type){',
    '    try{ if(!actx) actx=new (window.AudioContext||window.webkitAudioContext)();',
    '      var o=actx.createOscillator(), g=actx.createGain(); o.type=type||"square"; o.frequency.value=freq;',
    '      g.gain.value=0.04; o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime+dur);',
    '    }catch(e){}',
    '  }',
    '',
    '  function rect(x,y,w,h,c){ ctx.fillStyle=c; ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h)); }',
    '  function draw(){',
    '    ctx.fillStyle="#0b0d0f"; ctx.fillRect(0,0,W,H);',
    '    rect(player.x, player.y, player.w, player.h, "#3ecf8e");',
    '    items.forEach(function(o){ rect(o.x,o.y,o.w,o.h,"#f5c542"); });',
    '    hazards.forEach(function(o){ rect(o.x,o.y,o.w,o.h,"#e05252"); });',
    '    ctx.fillStyle="#e8eaed"; ctx.font="8px monospace"; ctx.textAlign="left";',
    '    ctx.fillText("SCORE "+score, 4, 10);',
    '    ctx.textAlign="right"; ctx.fillText("BEST "+best, W-4, 10);',
    '    if(state===STATE.READY){',
    '      ctx.fillStyle="rgba(0,0,0,.62)"; ctx.fillRect(0,0,W,H);',
    '      ctx.fillStyle="#3ecf8e"; ctx.textAlign="center"; ctx.font="bold 16px monospace";',
    '      ctx.fillText("像素小游戏", W/2, H/2-22);',
    '      ctx.fillStyle="#9aa3ad"; ctx.font="8px monospace";',
    '      ctx.fillText("方向键 / WASD 移动", W/2, H/2-2);',
    '      ctx.fillText("吃黄块得分，躲红块", W/2, H/2+10);',
    '      ctx.fillStyle="#e8eaed"; ctx.fillText("按空格或点击开始", W/2, H/2+30);',
    '    }',
    '    if(state===STATE.OVER){',
    '      ctx.fillStyle="rgba(0,0,0,.68)"; ctx.fillRect(0,0,W,H);',
    '      ctx.fillStyle="#e05252"; ctx.textAlign="center"; ctx.font="bold 16px monospace";',
    '      ctx.fillText("GAME OVER", W/2, H/2-16);',
    '      ctx.fillStyle="#e8eaed"; ctx.font="8px monospace";',
    '      ctx.fillText("得分 "+score+"  ·  最高 "+best, W/2, H/2+4);',
    '      ctx.fillStyle="#9aa3ad"; ctx.fillText("按空格或点击重开", W/2, H/2+22);',
    '    }',
    '  }',
    '',
    '  var last = 0;',
    '  function loop(now){',
    '    if(!last) last = now;',
    '    var dt = Math.min(0.05, (now-last)/1000); last = now;',
    '    update(dt); draw(); requestAnimationFrame(loop);',
    '  }',
    '  requestAnimationFrame(loop);',
    '})();',
    '<\/script>',
    '</body>',
    '</html>'
  ].join('\n');

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // ★ 兜底：模型常把贴图参数写成 null（Phaser 会画成「绿底斜线」的缺失贴图）
  //    画面本来就用 graphics 手绘时，这类精灵只是拿来挂物理体的 → 直接隐藏
  // ---------------------------------------------------------------------------
  function sanitizeNullTextures(html) {
    var s = String(html || '');
    if (!/null/.test(s)) return s;
    if (!/add\s*\.\s*(sprite|image|tileSprite|nineslice)/.test(s)) return s;

    // 匹配 .add.sprite(...) / .add.image(...) 里第 3 个参数是 null 的调用
    var re = /(\.add\s*\.\s*(?:sprite|image|tileSprite|nineslice)\s*\([^;\n]*?,\s*null\s*\))(?!\s*\.\s*(?:setVisible|setAlpha))/g;
    var n = 0;
    var out = s.replace(re, function (m) { n++; return m + '.setVisible(false)'; });
    if (n && typeof console !== 'undefined') {
      console.log('[EmberGame] 已自动隐藏 ' + n + ' 个 null 贴图精灵（避免绿色占位块）');
    }
    return out;
  }

  // 对外接口
  // ---------------------------------------------------------------------------
  window.EmberGame = {
    isGame: function (text) { return GAME_RE.test(String(text || '')); },

    // ★ 生成后纠正 Phaser 加载方式（本地优先 + 回退链）+ 清理 null 贴图
    normalize: function (html) { return sanitizeNullTextures(normalizePhaserLoader(html)); },

    // 引擎：3D → Three.js；明确说「不用库 / 极简」→ Canvas；其余 → Phaser
    engineFor: function (text) {
      var s = String(text || '');
      if (THREE_D_RE.test(s)) return 'three';
      return CANVAS_RE.test(s) ? 'canvas' : 'phaser';
    },

    rules: function () { return PHASER_RULES; },
    skeleton: function () { return PHASER_SKELETON; },

    // 是否应该做成多文件工程（显式要求，或需求复杂度够高）
    isMultiFile: function (text) { return wantMultiFile(text); },

    // ★ 更严格的判定：既要提到游戏，也要有「做/创建」这类动作，避免闲聊里出现"游戏"就注入规范
    isGameRequest: function (text) {
      var s = String(text || '');
      return GAME_RE.test(s) && /做|创建|生成|写|弄|搞|开发|建|build|make|create|add/i.test(s);
    },

    // 规范 + 画面档 + 骨架（不含【本次需求】），工坊用这个
    gameSpec: function (userRequest, opts) {
      opts = opts || {};
      var req = String(userRequest || '').trim();
      var engine = this.engineFor(req);
      var multi = (opts.multi === undefined) ? wantMultiFile(req) : !!opts.multi;
      if (engine === 'canvas') multi = false;          // Canvas 兜底只做单文件

      var rules, sk;
      if (engine === 'canvas') { rules = CANVAS_RULES; sk = CANVAS_SKELETON; }
      else if (engine === 'three') { rules = THREE_RULES; sk = ''; multi = false; }
      else if (multi) { rules = MULTI_RULES; sk = MULTI_SKELETON; }
      else { rules = PHASER_RULES; sk = PHASER_SKELETON; }

      var tier = pixelTierOf(req);
      var pxRules = tier ? pixelRulesFor(tier) : '';

      // ★ 按档位把骨架里的占位符替换掉（分辨率 / 色板数量说明）
      var DIMS = { '8bit': [256, 224], '16bit': [320, 224], 'modern': [480, 270] };
      var PALHINT = {
        '8bit': '≤16 色，只留暗 / 中 / 亮三阶，删掉所有过渡色',
        '16bit': '20 色左右，保留 5~6 阶明暗',
        'modern': '可扩到 30~40 色，增加高光和边缘光层',
        'none': '20 色左右，画面统一即可'
      };
      var dim = DIMS[tier] || [320, 224];
      var palText = PALHINT[tier] || PALHINT['none'];
      sk = sk.replace(/\{\{W\}\}/g, String(dim[0]))
             .replace(/\{\{H\}\}/g, String(dim[1]))
             .replace(/\{\{PALETTE_HINT\}\}/g, palText);

      var parts = [
        rules,
        '',
        '【本次使用引擎】' + (engine === 'canvas' ? '原生 Canvas 2D（零依赖）'
          : (engine === 'three' ? 'Three.js（3D，用 CDN ES module 引入，不要用 Phaser）' : 'Phaser 3'))
      ];
      // 3D：不注入像素/画风/密度/角色像素规则（那些是 2D 像素风的，对 3D 有害）
      if (engine === 'three') {
        parts.push('', '【提示】这是 3D 需求，上面那份 2D 规范里关于像素画法/画面密度/角色像素的部分**不适用**，'
          + '按 Three.js 规范做即可。**不要去读 phaser.min.js**（读它只会把上下文撑爆，对 3D 毫无帮助）。');
        return parts.join('\n');
      }
      if (multi) parts.push('', '【本次结构】多文件工程（按上面的目录结构拆成多个文件，不要合并）');
      if (pxRules) parts.push('', pxRules);
      else parts.push('', '【画面风格】用户没指定像素风，可用平滑矢量绘制（圆角 / 圆形 / 渐变都可以）。');
      parts.push('', densityRulesFor(tier));
      parts.push('', CHAR_RULES);

      // compact 模式（Agent 用）：只给规范，不塞整份骨架代码，避免把提示词撑得过大
      if (!opts.compact) {
        if (multi) {
          parts.push('', '【多文件骨架（必须基于它改造，文件逐个实现，路径与顺序照抄）】', '```', sk, '```');
        } else {
          parts.push('', '【游戏底座（必须基于它改；底座里的「玩法区」是演示代码，必须整段替换成本次需求的玩法）】', '```html', sk, '```');
        }
      } else if (multi) {
        parts.push('', '【文件结构】请拆成 index.html + js/config.js + js/assets.js + js/scenes.js + js/main.js，'
          + '脚本按此顺序引入；每个文件用普通 <script>，禁止 import/export，顶层用 var/function 声明。');
      }
      return parts.join('\n');
    },

    promptFor: function (userRequest, opts) {
      var req = String(userRequest || '').trim();
      return this.gameSpec(req, opts) + '\n\n【本次需求】\n' + req;
    },

    systemHint: function () {
      return '当用户要做游戏时默认使用 Phaser 3 底座（单文件 HTML + 本地/多 CDN 加载 + pixelArt + arcade 物理 + Boot/Menu/Game/Pause/Over 五场景 + 存档 + 暂停）；'
        + '只有用户明确说「不用库 / 极简」时才改用原生 Canvas。底座只提供地基，玩法必须按需求重新实现。禁止引用外部图片、音频、字体。';
    }
  };
})();
