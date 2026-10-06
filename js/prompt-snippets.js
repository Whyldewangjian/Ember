// ======================== 提示词片段库（独立模块，可整删） ========================
(function () {
  'use strict';

  if (window.__psInited) return;
  window.__psInited = true;

  const KEY = 'llm_prompt_snippets';
  const VER_KEY = 'llm_prompt_snippets_ver';
  const VER = 2;   // ★ 改内置片段内容时把这里 +1，用户端会自动整体换成新版

  let ipc = null;
  try { ipc = require('electron').ipcRenderer; } catch (e) {}

  // ---------- 分栏（纯功能分类） ----------
  const CATS = ['light', 'camera', 'style', 'other'];
  const CAT_NAME = { light: '灯光影调', camera: '镜头语言', style: '画质风格', other: '其他' };

  // ---------- 内置片段 ----------
  const DEFAULTS = [
    {
      name: '清晨双色温',
      cat: 'light',
      content: '【正向提示词】 > 物理精确渲染（PBR）清晨自然光照管线系统，严格的冷暖双重开尔文色温对比。初升朝阳低入射角超长斜射光（Low-angle raking light），主光源为3000K温润醇厚的暖金橙色直射光，投射出极具纵深感的拉长硬质接触阴影（Elongated contact shadows）。非受光阴影区域完全受7500K晨曦深邃冷蓝天光（Skylight）的无方向漫反射照亮，形成自然极致的冷暖色彩拮抗张力。高动态范围（HDR）光影比，高反差明暗分界线，微观空气悬浮尘埃微粒与轻薄晨雾带来的物理级体积光（Volumetric god rays/丁达尔效应），空气透视感，暗部冷色细节完全保留，高光处泛着微暖自然辉光，具有极强情绪张力的清晨史诗级电影氛围光照。\n【避免词 / 负向提示词】 > 避免：平光，正面直打平光，无阴影，正午顶光，阴天漫射漫光，单色温全局染色，画面发灰发平，暗部死黑无层次，高光过曝死白，缺乏反差，荧光色，摄影棚人工布光感，室内无自然光感，脏浊阴影。'
    },
    {
      name: '一般超写实电影',
      cat: 'style',
      content: '【正向提示词】 > 照片级真实，8K超高保真，ARRI ALEXA 65电影摄影机拍摄，搭配Panavision C系列及Cooke变形镜头，柯达Vision3 500T 5219电影胶片质感。细腻真实的35mm有机胶片颗粒，变形镜头特有的水平蓝色眩光与椭圆散景。全局光照，光线追踪反射，精确物理渲染（PBR），自然体积光与丁达尔效应，次表面散射（SSS），高动态范围（HDR）。微距级表面材质物理纹理，自然低饱和胶片调色，暗部细节保留，大师级构图，黄金分割，景深过渡极其平滑，顶级电影院线级画面质感。\n【避免词 / 负向提示词】 > 避免：抖动，果冻效应，画面闪烁，运动畸变，动态重影，人工数码锐化，塑料感，蜡像感，CG痕迹，3D渲染感，虚幻引擎，卡通，插画，绘画，平面化，高光死白，暗部死黑，过饱和色彩，模糊，低码率压缩噪点，瑕疵变形。'
    },
    {
      name: '黑白日漫',
      cat: 'style',
      content: '【正向提示词】 > 专业日本连载黑白漫画原稿质感，绝对纯黑白单色，高对比度分镜美学。顶级日漫手绘墨水线稿，细腻G笔尖（G-Pen）与丸笔尖压感线条变化，开明浓墨汁哑光质感。物理网点纸（60-80线精细半色调网点），严密规整的多层十字排线（Cross-hatching）与密排阴影，戏剧性强烈黑白光影（Chiaroscuro），边缘毛细渗墨细节。高动态黑白二值化反差，手工漫画原稿纸微纤维纹理，经典胶印印刷质感，大师级透视构图，极具视觉张力的线条速度感。\n【避免词 / 负向提示词】 > 避免：抖动，果冻效应，画面闪烁，运动畸变，动态重影，人工数码锐化，塑料感，蜡像感，CG痕迹，3D渲染感，虚幻引擎，卡通，插画，绘画，平面化，高光死白，暗部死黑，过饱和色彩，模糊，低码率压缩噪点，瑕疵变形。'
    },
    {
      name: '中式水墨',
      cat: 'style',
      content: '【正向提示词】 > 东方传统写意大写意水墨风格，古典水墨动画意境。真实的生宣纸微观手工棉麻纤维底纹，自然透光暗纹。纯正松烟墨色，墨分五色（焦、浓、重、淡、清）的丰富干湿浓淡层级；苍劲的毛笔枯笔飞白、饱蘸水汽的湿笔自然边缘水晕（渗墨毛边与水渍沉淀结晶）；兼具极少量的矿物石青与赭石微粒沉淀。大面积留白构图，以虚衬实，水汽氤氲的空气流体流动感，气韵生动，传统东方古典美学大师级画卷质感。\n【避免词 / 负向提示词】 > 避免：西洋油画厚涂，现代数码喷枪平涂，硬边矢量色块，现代3D渲染，CGI建模，高光反射，金属质感，光线追踪，真实照片，数码渐变，艳丽霓虹荧光色，机械硬线条，锐利边缘，西式排线阴影。'
    },
    {
      name: '矿物颜料',
      cat: 'style',
      content: '【正向提示词】 > 东方传统天然矿物岩彩重彩画风格，古典石窟壁画与高级岩彩艺术质感。手工粗磨矿物颜料独特的物理微粒质感，清晰可见的孔雀石（石绿）、蓝铜矿（石青）、朱砂、雌黄结晶微粒在光线下的哑光与微弱碎屑闪光。局部微凸的沥粉贴金、手工真金箔断裂剥落纹理与氧化银箔暗斑。粗织麻纸与风化泥层底料的凹凸糙面基底，温润微哑光的胶矾水固色层，伴随年代感的自然干燥微裂纹（冰裂网纹）与色层斑驳叠压。厚重浓郁的非透明矿物堆叠，沉稳古朴的矿物质地与历经岁月沉淀的厚重东方史诗氛围。\n【避免词 / 负向提示词】 > 避免：现代数码平涂，廉价水彩轻薄晕染，透明水波感，塑料反光，光滑平整表面，3D写实渲染，现代油画厚涂笔触，亮面高光，霓虹荧光色，矢量边缘，纯数码渐变，电脑插画感，摄影照片质感。'
    },
    {
      name: '马克笔线稿',
      cat: 'style',
      content: '【正向提示词】 > 极简影视美术前期手绘设定稿风格，画面纯粹明了，无任何过度刻画与装饰。黑色勾线笔仅负责交代人物、道具与场景的核心几何结构与利落大轮廓，线条点到即止，五官面部仅用几笔勾勒出正确的结构与朝向位置，完全不做细致描绘与微表情刻画。全画摒弃一切复杂光影与细碎调子，纯靠灰阶马克笔进行大笔触简括涂色：大面积浅灰与深灰迅速交代大体受光朝向，重色压实近景主体，淡灰色快速虚化远景，借此纯粹拉开主次聚焦与远近空间层次。纯图画呈现，泛微暖米黄色速写底纸，笔触干脆爽快，信息层级一目了然的专业手绘草设质感。\n【避免词 / 负向提示词】 > 避免：精细面部刻画，写实眼睛细节，丰富微表情，复杂睫毛瞳孔细节，超写实光影，微观细节刻画，精细排线素描，柔和过渡渐变阴影，多重反光，彩色，高饱和杂色，繁复背景，装饰花纹，草乱脏线，3D渲染感，电脑喷枪平涂，文字，边框线。'
    },
    {
      name: '写实角色参考生成',
      cat: 'other',
      content: '【正向提示词】 > 专业超写实电影级角色美术设定表，单反相机原始RAW照片质感，8K超高保真。严格继承参考图的角色容貌、骨相、体型与服装细节。纯色中性浅灰极简背景，大型柔光箱提供的摄影棚均匀平光，无剧烈投射阴影，精准还原物体本色。\n\n【微观真实物理质感】\n- 真实皮肤系统：近距可见的微观毛孔、自然皮脂微光泽与轻微皮肤纹理；真实通透的次表面散射（SSS）赋予面部血液温润感；眼球表面通透的水润反射层；眼周与唇部拥有极为逼真的生理性微细纹，彻底告别假人蜡像感。\n- 真实衣着织物：衣物具备明确的材质物理特性与真实重力下垂感；清晰可见的面料编织经纬织纹、布料边缘包边缝线与针脚细节；布料随着身体自然站立呈现出合乎物理规律的柔和褶皱与布纹张力，不同材质（如棉、麻、皮质、金属搭扣等）展现出截然不同的精确物理漫反射与光泽。\n\n【空间排列：严格自左向右横向分布】\n1. 最左侧区域：\n- 上方主头部肖像特写（肩部以上）：必须保证绝对的无表情状态（Neutral Blank Face），面部肌肉完全松弛平静，眼神放空直视，无任何喜怒哀乐的波澜，平整纯粹的中性脸。\n- 正下方整齐横向水平排列三个独立小方格（从左至右水平并排展示），展现真实自然且具有明显不对称肌肉特征的微表情：\n- 【喜】：自然生动的暖意笑容，绝非挤眉弄眼的做鬼脸。整体松弛大方，细节体现生理不对称：一侧嘴角抬起的弧度比另一侧略高，使得单侧脸颊苹果肌稍微更加饱满微鼓，双眼带着自然的笑意弯曲，其中一侧眼睛的眼周细纹比另一侧稍显丰富，生动舒展而不怪异；\n- 【怒】：极具冲击力的非对称爆发狂怒。彻底打破左右对称结构：一侧眉峰向下死死深拧紧贴眼眶，另一侧眉毛却反向挑起拉高，形成极为明显的一高一低错落；牙齿紧咬，下颌骨因发力而带着轻微侧向偏移，单侧咬肌明显隆起绷紧，双眼圆睁且单侧眼神压得更狠，凶悍且极具人性张力；\n- 【哀】：打破对称的真实悲伤绝望。左右肌肉出现明显的失衡垮塌：仅有一侧眉头呈现神经性抽动隆起的微蹙，另一侧眉梢完全无力垂落；嘴唇紧闭但单侧嘴角因肌肉失力而向下垮得更深，导致整个下唇线呈现微微向一侧倾斜的颓唐弧度，眼神落寞游离，充满令人心碎的真实非对称垮塌感。\n2. 左二区域：全身正面视图（Front view），自然下垂手臂放松站立。\n3. 右二区域：全身四分之三侧面视图（Three-quarter view / 45-degree angle），自然站立姿态。\n4. 最右区域：全身背面视图（Back view），完整交代后脑发丝层次、背部服装剪裁缝线与鞋后跟细节。\n\n四个视角严格对齐同一水平基准线，比例精准，严丝合缝的顶配工业级写实资产设定图。\n\n【避免词 / 负向提示词】 > 避免：任何文字，文字说明，字母，汉字，数字，字符，水印，签名，UI界面，标签，说明文字，标题，边框文字，面部做鬼脸，挤眉弄眼，刻意搞笑表情，五官异常扭曲，面部左右完全镜像对称，机械死板的脸，左右完全一样高的眉毛与嘴角，绝对对称的皱纹，平淡无力的微弱怒气，大肖像特写带有表情，塑料假人感，蜡像人，数码磨皮，无毛孔的光滑假脸，美颜滤镜感，CG游戏建模，3D渲染痕迹，死板假笑，僵硬衣服褶皱，没有质感的平滑色块，夸张动作，强光硬影，逆光，多余杂色背景，前后长相身材不一致，透视错位。'
    }
  ];

  // ---------- 只在主页的两个输入框上挂「片段」标签（对话 / 分镜 / 工坊均已移除） ----------
  const TARGETS = [
    { id: 'input1', bg: 'input', right: 22 },
    { id: 'input2', bg: 'input', right: 22 }
  ];


  let snippets = [];
  let filterCat = 'all';
  let editingId = null;
  let lastInput = null;
  let targetInput = null;
  let pendingSnippet = null;
  const attached = [];

  function uid() { return 'ps_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function migrate(s) {
    if (!s) return null;
    let cat = s.cat;
    if (!cat) {
      if (s.mode === 'storyboard') cat = 'camera';
      else if (s.mode === 'workshop') cat = 'style';
      else cat = 'other';
    }
    if (CATS.indexOf(cat) < 0) cat = 'other';
    return {
      id: s.id || uid(),
      name: s.name || '未命名',
      content: String(s.content || ''),
      cat: cat,
      useCount: s.useCount || 0,
      createdAt: s.createdAt || Date.now()
    };
  }

  function seed() {
    snippets = DEFAULTS.map(migrate).filter(Boolean);
    try { localStorage.setItem(VER_KEY, String(VER)); } catch (e) {}
    save();
  }

  function load() {
    try {
      const storedVer = localStorage.getItem(VER_KEY);
      if (storedVer !== String(VER)) { seed(); return; }   // 内置片段有新版本 → 整体替换
      const raw = localStorage.getItem(KEY);
      if (!raw) { seed(); return; }
      const arr = JSON.parse(raw);
      snippets = (Array.isArray(arr) ? arr : []).map(migrate).filter(Boolean);
    } catch (e) { snippets = []; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(snippets)); } catch (e) {}
    try { document.dispatchEvent(new CustomEvent('ps-snippets-changed')); } catch (e) {}
  }
  function toast(msg) { if (typeof showToast === 'function') showToast(msg); }

  // ---------- 样式 ----------
  function injectStyles() {
    if (document.getElementById('ps-styles')) return;
    const st = document.createElement('style');
    st.id = 'ps-styles';
    st.textContent = [
      '.ps-row{display:flex;justify-content:flex-end;align-items:flex-end;flex:0 0 auto;',
      '  font-size:0;line-height:0;position:relative;z-index:50;pointer-events:none;',
      '  opacity:0;transition:opacity .12s;}',
      '.ps-btn{display:inline-flex;align-items:center;gap:5px;margin-right:10px;pointer-events:auto;',
      '  padding:3px 10px 3px;border:1px solid var(--panel-input-border);border-bottom:0;',
      '  border-radius:7px 7px 0 0;background:var(--panel-input-bg);',
      '  color:var(--text-dim);font-size:11px;font-family:inherit;line-height:1.5;letter-spacing:.3px;cursor:pointer;',
      '  opacity:.62;transition:opacity .15s,color .15s,border-color .15s,background .15s;}',
      '.ps-btn i{font-size:10px;}',
      '.ps-btn.ps-bg-input{background:var(--input-bg);border-color:var(--input-border);}',
      '.ps-btn:hover{opacity:1;color:var(--accent);border-color:var(--accent);background:var(--accent-softer);}',
      '.ps-btn.ps-on{opacity:1;color:var(--accent);border-color:var(--accent);}',

      '.ps-panel{display:flex;flex-direction:column;min-height:0;overflow:hidden;padding:0;}',
      '.ps-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--card-border);flex:0 0 auto;}',
      '.ps-title{font-size:14px;font-weight:700;color:var(--text-soft);white-space:nowrap;}',
      '.ps-search{flex:1;min-width:0;padding:6px 10px;border:1px solid var(--panel-input-border);border-radius:7px;',
      '  background:var(--panel-input-bg);color:var(--text-soft);font-size:12px;outline:none;font-family:inherit;}',
      '.ps-search:focus{border-color:var(--accent);}',
      '.ps-x{width:26px;height:26px;flex:0 0 auto;border:0;border-radius:7px;background:transparent;color:var(--text-muted);',
      '  font-size:16px;cursor:pointer;line-height:1;}',
      '.ps-x:hover{background:rgba(255,255,255,.08);color:var(--text-soft);}',
      '.ps-tabs{display:flex;gap:4px;padding:8px 14px 0;flex:0 0 auto;flex-wrap:wrap;}',
      '.ps-tab{padding:4px 10px;border-radius:7px;font-size:12px;color:var(--text-muted);cursor:pointer;',
      '  background:transparent;border:1px solid transparent;font-family:inherit;}',
      '.ps-tab:hover{color:var(--text-soft);}',
      '.ps-tab.on{background:var(--accent);color:var(--btn-text);font-weight:700;}',
      '.ps-body{flex:1;min-height:0;overflow-y:auto;padding:10px 14px 14px;}',
      '.ps-item{border:1px solid var(--card-border);border-radius:10px;padding:9px 11px;margin-bottom:8px;',
      '  background:rgba(255,255,255,.02);cursor:pointer;transition:all .15s;}',
      '.ps-item:hover{border-color:var(--accent);background:var(--accent-softer);}',
      '.ps-item-top{display:flex;align-items:center;gap:8px;}',
      '.ps-item-name{font-size:12.5px;font-weight:700;color:var(--text-soft);flex:1;min-width:0;overflow:hidden;',
      '  text-overflow:ellipsis;white-space:nowrap;}',
      '.ps-item-mode{font-size:10.5px;padding:1px 6px;border-radius:5px;background:var(--accent-soft);color:var(--accent);flex:0 0 auto;}',
      '.ps-item-cnt{font-size:10.5px;color:var(--text-dim);flex:0 0 auto;}',
      '.ps-item-body{font-size:11.5px;color:var(--text-muted);margin-top:5px;line-height:1.6;',
      '  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word;}',
      '.ps-item-acts{display:flex;gap:6px;margin-top:7px;}',
      '.ps-mini{padding:2px 8px;border:1px solid var(--card-border);border-radius:6px;background:transparent;',
      '  color:var(--text-muted);font-size:11px;cursor:pointer;font-family:inherit;}',
      '.ps-mini:hover{color:var(--accent);border-color:var(--accent);}',
      '.ps-empty{text-align:center;color:var(--text-dim);font-size:12px;padding:24px 0;}',
      '.ps-foot{display:flex;align-items:center;gap:8px;padding:10px 14px;border-top:1px solid var(--card-border);flex:0 0 auto;}',
      '.ps-foot .ps-grow{flex:1;}',
      '.ps-tip{font-size:11px;color:var(--text-dim);}',
      '.ps-editor{display:none;flex-direction:column;gap:6px;}',
      '.ps-editor.open{display:flex;}',
      '.ps-editor label{font-size:11.5px;color:var(--text-muted);font-weight:600;}',
      '.ps-editor input,.ps-editor textarea,.ps-editor select{padding:7px 9px;border:1px solid var(--panel-input-border);',
      '  border-radius:7px;background:var(--panel-input-bg);color:var(--text-soft);font-size:12.5px;outline:none;',
      '  font-family:inherit;width:100%;box-sizing:border-box;}',
      '.ps-editor textarea{min-height:160px;resize:vertical;line-height:1.6;}',
      '.ps-editor input:focus,.ps-editor textarea:focus,.ps-editor select:focus{border-color:var(--accent);}',
      '.ps-editor-acts{display:flex;gap:8px;margin-top:4px;}',
      '.ps-ok{padding:6px 14px;border-radius:7px;border:0;background:var(--btn-bg);color:var(--btn-text);',
      '  font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;}',
      '.ps-ph{display:none;flex-direction:column;gap:6px;}',
      '.ps-ph.open{display:flex;}',
      '.ps-ph label{font-size:11.5px;color:var(--text-muted);font-weight:600;}',
      '.ps-ph input{padding:7px 9px;border:1px solid var(--panel-input-border);border-radius:7px;',
      '  background:var(--panel-input-bg);color:var(--text-soft);font-size:12.5px;outline:none;font-family:inherit;width:100%;box-sizing:border-box;}'
    ].join('\n');
    document.head.appendChild(st);
  }

  // ---------- 弹窗 ----------
  let overlay, panel, elSearch, elList, elEditor, elName, elContent, elCat, elPh, elPhBox, elTabs;

  function buildModal() {
    const catOptions = CATS.map(function (c) {
      return '<option value="' + c + '">' + CAT_NAME[c] + '</option>';
    }).join('');

    overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'psOverlay';
    overlay.style.cssText = 'display:none;align-items:center;justify-content:center;z-index:9999;';
    overlay.innerHTML =
      '<div class="modal glass-modal ps-panel" id="psPanel" ' +
        'style="width:660px;max-width:94vw;max-height:82vh;display:flex;flex-direction:column;padding:0;overflow:hidden;">' +
        '<div class="ps-head">' +
          '<span class="ps-title">提示词片段</span>' +
          '<input class="ps-search" placeholder="搜索片段名称或内容...">' +
          '<button class="ps-x" title="关闭">&#10005;</button>' +
        '</div>' +
        '<div class="ps-tabs"></div>' +
        '<div class="ps-body">' +
          '<div class="ps-list"></div>' +
          '<div class="ps-editor">' +
            '<label>名称</label><input class="ps-name" placeholder="例如：低角度仰拍">' +
            '<label>内容</label><textarea class="ps-content" placeholder="要插入到输入框的文字；生图类片段会被直接用作提示词"></textarea>' +
            '<label>分类</label>' +
            '<select class="ps-cat">' + catOptions + '</select>' +
            '<div class="ps-editor-acts">' +
              '<button class="ps-ok ps-save">保存片段</button>' +
              '<button class="ps-mini ps-cancel">取消</button>' +
            '</div>' +
          '</div>' +
          '<div class="ps-ph">' +
            '<div class="ps-ph-box"></div>' +
            '<div class="ps-editor-acts">' +
              '<button class="ps-ok ps-ph-ok">插入</button>' +
              '<button class="ps-mini ps-ph-cancel">取消</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="ps-foot">' +
          '<button class="ps-mini ps-new">+ 新建片段</button>' +
          '<button class="ps-mini ps-fromsel">用选中内容新建</button>' +
          '<span class="ps-grow"></span>' +
          '<span class="ps-tip">点片段即插入到光标处</span>' +
          '<button class="ps-mini ps-export">导出</button>' +
          '<button class="ps-mini ps-import">导入</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    panel = overlay.querySelector('#psPanel');
    elSearch = overlay.querySelector('.ps-search');
    elList = overlay.querySelector('.ps-list');
    elEditor = overlay.querySelector('.ps-editor');
    elName = overlay.querySelector('.ps-name');
    elContent = overlay.querySelector('.ps-content');
    elCat = overlay.querySelector('.ps-cat');
    elPh = overlay.querySelector('.ps-ph');
    elPhBox = overlay.querySelector('.ps-ph-box');
    elTabs = overlay.querySelector('.ps-tabs');

    panel.addEventListener('click', function (e) { e.stopPropagation(); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.style.display === 'flex') closeModal();
    });

    [{ k: 'all', n: '全部' }].concat(CATS.map(function (c) { return { k: c, n: CAT_NAME[c] }; }))
      .forEach(function (t) {
        const b = document.createElement('button');
        b.className = 'ps-tab';
        b.dataset.cat = t.k;
        b.textContent = t.n;
        b.addEventListener('click', function () {
          filterCat = t.k;
          renderTabs();
          renderList();
        });
        elTabs.appendChild(b);
      });

    overlay.querySelector('.ps-x').addEventListener('click', closeModal);
    elSearch.addEventListener('input', renderList);
    overlay.querySelector('.ps-new').addEventListener('click', function () { openEditor(null); });
    overlay.querySelector('.ps-fromsel').addEventListener('click', function () {
      let sel = '';
      if (targetInput && targetInput.selectionStart != null && targetInput.selectionEnd > targetInput.selectionStart) {
        sel = targetInput.value.slice(targetInput.selectionStart, targetInput.selectionEnd);
      }
      if (!sel) { toast('请先在输入框里选中一段文字'); return; }
      openEditor(null, sel);
    });
    overlay.querySelector('.ps-cancel').addEventListener('click', closeEditor);
    overlay.querySelector('.ps-save').addEventListener('click', saveEditor);
    overlay.querySelector('.ps-ph-cancel').addEventListener('click', function () {
      pendingSnippet = null;
      closePh();
    });
    overlay.querySelector('.ps-ph-ok').addEventListener('click', doInsertWithPh);
    overlay.querySelector('.ps-export').addEventListener('click', exportJson);
    overlay.querySelector('.ps-import').addEventListener('click', importJson);
  }

  function resetPanels() {
    elList.style.display = '';
    elEditor.style.display = 'none';
    elPh.style.display = 'none';
    elPhBox.innerHTML = '';
    pendingSnippet = null;
  }

  function renderTabs() {
    Array.prototype.slice.call(elTabs.children).forEach(function (b) {
      b.classList.toggle('on', b.dataset.cat === filterCat);
    });
  }

  function visibleList() {
    const kw = (elSearch.value || '').trim().toLowerCase();
    let list = snippets.slice();
    if (filterCat !== 'all') list = list.filter(function (s) { return s.cat === filterCat; });
    if (kw) {
      list = list.filter(function (s) {
        return (s.name || '').toLowerCase().indexOf(kw) >= 0 || (s.content || '').toLowerCase().indexOf(kw) >= 0;
      });
    }
    list.sort(function (a, b) { return (b.useCount || 0) - (a.useCount || 0) || (b.createdAt || 0) - (a.createdAt || 0); });
    return list;
  }

  function renderList() {
    const list = visibleList();
    elList.innerHTML = '';
    if (!list.length) { elList.innerHTML = '<div class="ps-empty">没有匹配的片段</div>'; return; }
    list.forEach(function (s) {
      const item = document.createElement('div');
      item.className = 'ps-item';
      item.innerHTML =
        '<div class="ps-item-top">' +
          '<span class="ps-item-name">' + esc(s.name || '未命名') + '</span>' +
          '<span class="ps-item-mode">' + (CAT_NAME[s.cat] || '其他') + '</span>' +
          '<span class="ps-item-cnt">用过 ' + (s.useCount || 0) + ' 次</span>' +
        '</div>' +
        '<div class="ps-item-body">' + esc(s.content || '') + '</div>' +
        '<div class="ps-item-acts">' +
          '<button class="ps-mini ps-edit">编辑</button>' +
          '<button class="ps-mini ps-del">删除</button>' +
        '</div>';
      item.addEventListener('click', function (e) {
        if (e.target.classList.contains('ps-edit') || e.target.classList.contains('ps-del')) return;
        useSnippet(s);
      });
      item.querySelector('.ps-edit').addEventListener('click', function (e) { e.stopPropagation(); openEditor(s); });
      item.querySelector('.ps-del').addEventListener('click', async function (e) {
        e.stopPropagation();
        if (!(await ask('删除片段「' + (s.name || '未命名') + '」？'))) return;
        snippets = snippets.filter(function (x) { return x.id !== s.id; });
        save();
        renderList();
      });
      elList.appendChild(item);
    });
  }

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function ask(msg) {
    if (typeof window.showConfirm === 'function') return window.showConfirm(msg);
    try { return Promise.resolve(!!window.confirm(msg)); } catch (e) { return Promise.resolve(false); }
  }

  function openEditor(s, prefill) {
    editingId = s ? s.id : null;
    elName.value = s ? (s.name || '') : '';
    elContent.value = s ? (s.content || '') : (prefill || '');
    elCat.value = s ? (s.cat || 'other') : (filterCat === 'all' ? 'other' : filterCat);
    elList.style.display = 'none';
    elPh.style.display = 'none';
    elEditor.style.display = 'flex';
    elName.focus();
  }
  function closeEditor() { editingId = null; elEditor.style.display = 'none'; elList.style.display = ''; }
  function saveEditor() {
    const name = (elName.value || '').trim() || '未命名片段';
    const content = (elContent.value || '').trim();
    if (!content) { toast('片段内容不能为空'); return; }
    if (editingId) {
      const s = snippets.find(function (x) { return x.id === editingId; });
      if (s) { s.name = name; s.content = content; s.cat = elCat.value; }
    } else {
      snippets.push({ id: uid(), name: name, content: content, cat: elCat.value, useCount: 0, createdAt: Date.now() });
    }
    save(); closeEditor(); renderList(); toast('✅ 已保存片段');
  }

  function placeholdersOf(text) {
    const out = [];
    String(text || '').replace(/\{([^{}]+)\}/g, function (m, k) { if (out.indexOf(k) < 0) out.push(k); return m; });
    return out;
  }
  function closePh() { elPh.style.display = 'none'; elPhBox.innerHTML = ''; elList.style.display = ''; }

  function insertAtCaret(el, text) {
    if (!el) { toast('请先点击要插入的输入框'); return; }
    const start = (el.selectionStart != null) ? el.selectionStart : (el.value || '').length;
    const end = (el.selectionEnd != null) ? el.selectionEnd : start;
    el.focus();
    if (typeof el.setRangeText === 'function') el.setRangeText(text, start, end, 'end');
    else el.value = (el.value || '').slice(0, start) + text + (el.value || '').slice(end);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.focus();
  }

  function useSnippet(s) {
    const phs = placeholdersOf(s.content);
    if (!phs.length) {
      s.useCount = (s.useCount || 0) + 1;
      save();
      const target = targetInput || lastInput;
      closeModal();
      insertAtCaret(target, s.content);
      toast('已插入片段：' + (s.name || ''));
      return;
    }
    pendingSnippet = s;
    elList.style.display = 'none';
    elEditor.style.display = 'none';
    elPhBox.innerHTML = '';
    phs.forEach(function (k) {
      const wrap = document.createElement('div');
      wrap.innerHTML = '<label>' + esc(k) + '</label><input data-ph="' + esc(k) + '" placeholder="填写「' + esc(k) + '」">';
      elPhBox.appendChild(wrap);
    });
    elPh.style.display = 'flex';
    const first = elPhBox.querySelector('input');
    if (first) first.focus();
  }

  function doInsertWithPh() {
    if (!pendingSnippet) return;
    let text = pendingSnippet.content;
    Array.prototype.slice.call(elPhBox.querySelectorAll('input')).forEach(function (inp) {
      const k = inp.dataset.ph;
      const v = (inp.value || '').trim();
      text = text.split('{' + k + '}').join(v || ('{' + k + '}'));
    });
    pendingSnippet.useCount = (pendingSnippet.useCount || 0) + 1;
    save();
    const name = pendingSnippet.name;
    const target = targetInput || lastInput;
    pendingSnippet = null;
    closePh();
    closeModal();
    insertAtCaret(target, text);
    toast('已插入片段：' + (name || ''));
  }

  async function exportJson() {
    const text = JSON.stringify(snippets, null, 2);
    if (ipc && ipc.invoke) {
      try {
        const r = await ipc.invoke('save-file-dialog', {
          title: '导出提示词片段', defaultPath: '提示词片段.json',
          filters: [{ name: 'JSON', extensions: ['json'] }]
        });
        if (r && !r.canceled && r.filePath) {
          const w = await ipc.invoke('write-file', r.filePath, text);
          toast((w && w.ok) ? '✅ 已导出' : '导出失败');
        }
        return;
      } catch (e) {}
    }
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '提示词片段.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importJson() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json'; inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.addEventListener('change', function () {
      const f = this.files && this.files[0];
      if (f) {
        const rd = new FileReader();
        rd.onload = function () {
          try {
            const arr = JSON.parse(String(rd.result || '[]'));
            if (!Array.isArray(arr)) throw new Error('文件格式不对');
            let n = 0;
            arr.forEach(function (s) {
              const m = migrate(s);
              if (m && m.content) { snippets.push(m); n++; }
            });
            save(); renderList(); toast('已导入 ' + n + ' 条片段');
          } catch (e) { toast('导入失败：' + (e.message || e)); }
        };
        rd.readAsText(f);
      }
      document.body.removeChild(inp);
    });
    inp.click();
  }

  function openModal(el) {
    targetInput = el || lastInput || null;
    filterCat = 'all';
    renderTabs();
    elSearch.value = '';
    resetPanels();
    renderList();
    overlay.style.display = 'flex';
    overlay.classList.add('show');
    elSearch.focus();
  }
  function closeModal() {
    overlay.style.display = 'none';
    overlay.classList.remove('show');
    resetPanels();
  }
    // ★ 供外部调用（画布节点等）：把片段插入到指定的输入框
    window.__psOpenFor = function (el) { openModal(el || null); };


  // ---------- 标签位置 ----------
  function tighten(item) {
    if (Date.now() < (item.readyAt || 0)) return false;
    const row = item.row, anchor = item.anchor;
    const ab = anchor.getBoundingClientRect();
    if (ab.height <= 0) return false;
    const rb = row.getBoundingClientRect();
    const gap = ab.top - rb.bottom;
    const cur = item.offset || 0;
    item.offset = cur + gap + 1;
    row.style.transform = 'translateY(' + item.offset + 'px)';
    if (row.style.opacity !== '1') row.style.opacity = '1';
    return true;
  }
  function settle(item) {
    [0, 120, 300, 700, 1400].forEach(function (ms) {
      setTimeout(function () { tighten(item); }, ms);
    });
  }
  function watchVisible(item) {
    const host = item.anchor.closest('.app-mode, .chat-mode, .main-area');
    if (!host || typeof MutationObserver !== 'function') return;
    const mo = new MutationObserver(function () {
      if (host.getBoundingClientRect().height > 0) {
        item.readyAt = Date.now() + 240;
        settle(item);
      }
    });
    mo.observe(host, { attributes: true, attributeFilter: ['style', 'class'] });
  }
  function watchSize(item) {
    if (typeof ResizeObserver !== 'function') return;
    try {
      const ro = new ResizeObserver(function () { tighten(item); });
      ro.observe(item.btn);
    } catch (e) {}
  }

  function attachButtons() {
    TARGETS.forEach(function (t) {
      const el = document.getElementById(t.id);
      if (!el || el.dataset.psAttached) return;
      el.dataset.psAttached = '1';

      const row = document.createElement('div');
      row.className = 'ps-row';

      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ps-btn';
      b.dataset.psFor = t.id;
      b.innerHTML = '<i class="fas fa-bookmark"></i><span>片段</span>';
      b.title = '插入提示词片段';
      row.appendChild(b);

      const parent = el.parentElement;
      const isFr = !!(parent && parent.classList.contains('fr-textarea-wrap'));
      const anchor = isFr ? parent : el;
      if (!anchor || !anchor.parentNode) return;

      if (t.bg === 'input') b.classList.add('ps-bg-input');
      b.style.marginRight = (t.right || 10) + 'px';

      anchor.parentNode.insertBefore(row, anchor);

      const item = { row: row, btn: b, anchor: anchor, input: el, offset: 0, readyAt: Date.now() + 260 };
      attached.push(item);
      watchVisible(item);
      watchSize(item);
      settle(item);
    });
  }

  document.addEventListener('click', function (e) {
    let btn = null;
    const path = (e.composedPath && e.composedPath()) || [];
    for (let i = 0; i < path.length; i++) {
      const n = path[i];
      if (n && n.classList && n.classList.contains('ps-btn')) { btn = n; break; }
    }
    if (!btn && e.target && e.target.closest) btn = e.target.closest('.ps-btn');
    if (!btn) return;
    const tid = btn.dataset.psFor;
    if (!tid) return;
    e.preventDefault();
    e.stopPropagation();
    const el = document.getElementById(tid);
    if (el) lastInput = el;
    openModal(el);
  }, true);

  injectStyles();
  load();
  buildModal();
  attachButtons();

  document.addEventListener('focusin', function (e) {
    const el = e.target;
    if (!el || (el.tagName !== 'TEXTAREA' && !(el.tagName === 'INPUT' && el.type === 'text'))) return;
    if (overlay && overlay.contains(el)) return;
    if (!TARGETS.some(function (t) { return t.id === el.id; })) return;
    lastInput = el;
    attached.forEach(function (it) {
      if (it.input === el) { tighten(it); it.btn.classList.add('ps-on'); }
      else it.btn.classList.remove('ps-on');
    });
  }, true);

  document.addEventListener('focusout', function () {
    setTimeout(function () {
      const a = document.activeElement;
      if (a && overlay && overlay.contains(a)) return;
      const still = attached.some(function (it) { return it.input === a; });
      if (!still) attached.forEach(function (it) { it.btn.classList.remove('ps-on'); });
    }, 60);
  }, true);

  window.addEventListener('resize', function () {
    clearTimeout(window.__psTightenTimer);
    window.__psTightenTimer = setTimeout(function () {
      attached.forEach(function (it) { it.readyAt = Date.now() + 60; tighten(it); });
    }, 150);
  });

  window.__psSnippets = function () { return snippets; };
  window.__psByCat = function (cat) {
    return snippets.filter(function (s) { return s.cat === cat; });
  };
})();
