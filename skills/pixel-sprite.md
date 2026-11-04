# 技能：角色精灵表

## 适用场景

要往游戏里加一个角色、敌人、NPC、塔或道具，而且它需要动画（待机、行走、开火、被击）。

## 铁律（顺序不能变）

**第一步：单独做，单独给用户看。**
**第二步：用户说 OK 之后，才集成进游戏。**

禁止在游戏代码里"顺便画一下角色"。这是画面变简陋的头号原因。

## 目录结构

```
<工作文件夹>/
  assets/char/<名字>/
    sprite.js        像素数据 + 绘制函数（唯一来源，预览页和游戏都引它）
    preview.html     预览页：放大 4 倍、带像素网格、循环动画
    meta.json        尺寸 / 帧 / 方向 / 锚点 / 色板
```

`<名字>` 用小写英文加连字符：`knight`、`slime-green`、`tower-arrow`。

## 规格（必须照抄这些数字）

- 尺寸：32×48（普通角色）｜48×64（主角）
- 方向：down / left / right / up（四个都要）
- 帧数：待机 2 帧、行走 4 帧
- 色板：8 到 14 色
- 描边：外轮廓 1px，用同色系最暗色，不用纯黑
- 锚点：脚底中心（写进 meta.json，如 `[16, 44]`）
- 渲染：`imageSmoothingEnabled = false`，坐标为整数

## meta.json 格式

```json
{
  "id": "char.knight",
  "name": "白衫骑士",
  "frameSize": [32, 48],
  "dirs": ["down", "left", "right", "up"],
  "frames": { "idle": 2, "walk": 4 },
  "anchor": [16, 44],
  "palette": ["#141a20", "#8a939f", "#c9d3dd", "#e8c9a0"],
  "source": "sprite.js"
}
```

## 步骤

1. 先只做「朝下 + 待机第 1 帧」：在 `sprite.js` 里用字符矩阵或像素数组定义它
2. **preview.html 直接复制模板**：`skills/templates/sprite-preview.html`（同目录放 sprite.js 即可，模板会自动识别）
3. 给用户看这一帧，等一句"可以"
4. 补齐：其余三个方向、待机 2 帧、行走 4 帧
5. 再给用户看一次：这次的验收台能**点按钮切方向、播放/暂停、逐帧**，他看到的动画就是游戏里的动画
6. 写 `meta.json`
7. **调 `check-asset`**：本件的颜色与 `assets/palette.json` 重合率要 ≥70%
8. 用户最终确认后，才在游戏里用 `addCanvas` 接入（见下面「怎么进游戏」）

## sprite.js 的接口约定（必须满足，否则验收台和游戏都用不了）

```js
window.Sprite = {          // 名字随便，但必须暴露这些字段
  id: 'char.knight',
  frameSize: [32, 48],
  palette: { k: '#1b2430', a: '#93a9bf', ... },
  dirs: ['down', 'left', 'right', 'up'],
  frames: { idle: 2, walk: 4 },
  animMs: 120,                       // 帧间隔：验收页和游戏都读它
  draw: function (ctx, opt) {},       // opt = { dir, frame, x, y }
  makeCanvas: function (opt) {}       // 返回一张 w×h 的 canvas
};
```

**只要满足这个约定，验收台和游戏用的是同一份代码 —— 预览什么样，游戏里就什么样。**

## 怎么进游戏（已验证）

```js
// 在 Phaser 场景里
const S = window.Sprite;
this.textures.addCanvas('knight', S.makeCanvas({ dir: 'down', frame: 0 }));
const player = this.add.sprite(320, 220, 'knight').setOrigin(0.5, 1).setScale(3);

// 换帧：重画到同一张纹理，然后 refresh
const dst = this.textures.get('knight').getSourceImage();
dst.getContext('2d').clearRect(0, 0, dst.width, dst.height);
dst.getContext('2d').drawImage(S.makeCanvas({ dir, frame }), 0, 0);
this.textures.get('knight').refresh();
```

**游戏里禁止再写一份像素数据 —— 只能引用这个文件。**

## preview.html 必须包含（用模板就自动有了）

- 左侧大图（放大 8 倍）+ 像素网格开关
- **方向按钮**（下/左/右/上）
- **走路 / 待机切换**
- **播放 / 暂停 / 上一帧 / 下一帧**
- 速度（帧间隔）切换
- 走路帧条（点一下跳到该帧）
- 色板色块 + 元信息（尺寸 / 方向数 / 帧数）
- 深色背景、地面参考线（判断脚底是否齐平）

## 自检清单（逐条打勾）

- [ ] 纯黑剪影下能认出是人形，能看出朝向
- [ ] 描边连续，没有断口
- [ ] 四个方向的脚底在同一水平线，不飘不陷
- [ ] 行走 4 帧循环播放时不跳、不抖
- [ ] 放大 4 倍看：没有半透明像素、没有抗锯齿边缘、没有非整数坐标
- [ ] `meta.json` 的锚点和画面里脚底位置一致
- [ ] 验收台能直接双击打开，不依赖网络，按钮都能点
- [ ] `check-asset` 重合率 ≥ 70%（颜色来自 PRD 色板）

## 禁止事项

- 禁止用 emoji、字体字符、矢量图形冒充像素画
- 禁止把一个方向水平翻转当另一个方向（左右翻转可以，上下不行）
- 禁止用 2 帧"抖动"冒充 4 帧行走
- 禁止先写进游戏、再回头补预览页（顺序反了质量必掉）
