/* ============================================================================
 *  「充值并获取 API」弹窗的内容配置
 *  —— 想改文案 / 换链接 / 加模型，只改这个文件就行，不用动别的代码
 * ==========================================================================*/
window.EMBER_RECHARGE = {

  // ① 推荐链接（会显示出来，也会用系统浏览器打开）
  link: 'https://api.vveai.com/register?aff=PDax',

  // ② 弹窗顶部的一句话说明
  intro: [
    'Ember 本身不带模型额度。文字、看图、生图这些能力，都要通过 API 调用模型，按用量计费。',
    '在下面开通之后，把拿到的 Key 填进「设置 → API 配置」，就能开始用了。'
  ],

  // ③ 操作步骤
  //    title  小标题
  //    desc   正文
  //    items  可选，会渲染成缩进的小条目
  //    img    可选，截图路径（放到 image/ 目录下，例如 'image/recharge-2.png'）
  stepsTitle: '五步搞定',
  steps: [
    {
      title: '打开开通页面',
      desc: '点上面的按钮，用浏览器打开，注册账号。'
    },
    {
      title: '创建令牌 Key',
      desc: '进入控制台，点击「创建令牌 Key」，右侧会弹出创建窗口。'
        + '分组里除了默认的 default，还可以再加一个 Claud_kiro，用来使用 Claude 系列模型。'
        + '填好后点下方的「提交 / 保存」。'
    },
    {
      title: '复制密钥',
      desc: '创建完会出现一串「密钥 ApiKey」，复制它。'
        + '然后进入 Ember 的「设置 → API 配置」，配置你要用的模型。'
    },
    {
      title: '按需求填写信息',
      desc: '在 API 配置里逐项填：',
      items: [
        '名称：任意，一般保持和模型名称一致即可。',
        '地址：https://api.vveai.com/v1',
        'Key：刚刚复制的令牌 Key。',
        '模型：模型名称，来自网站里的「模型广场」。可以直接复制下方列表推荐的性价比高的实用模型，也可以自己在模型广场挑选任意模型，注意格式要完全正确。',
        '视觉 / 生图：按模型特性勾选。视觉 = 这个模型能看图；生图 = 用它来出图。'
      ]
    },
    {
      title: '可以加多个模型',
      desc: '在设置页可以添加多个模型，地址和 Key 都保持不变，'
        + '只改「模型名称」和下面的「视觉 / 生图」勾选即可。'
        + '全部填完后，一定要点设置页右下角的「保存设置」，不点的话配置不会保存。'
        + '另外，Deepseek 系列的模型推荐直接到 Deepseek 官网充值使用。'
    }
  ],

  // ④ 模型怎么选
  //    model  模型名称    use  推荐用途
  //    vision 能不能看图   image 能不能生图   （true / false）
  modelsTitle: '模型怎么选',
  modelsNote: '',
  models: [
    { model: 'deepseek-v4-pro',            use: '一般推理、编程',              vision: false, image: false },
    { model: 'gemini-3.8-flash',           use: '写提示词',                    vision: true,  image: false },
    { model: 'nano-banana-lite',           use: '超快生图（固定 1K，1:1）',     vision: false, image: true  },
    { model: 'gpt-image-2.5-sunburst',     use: '高质量生图',                  vision: true,  image: true  },
    { model: 'claude-sonnet-4-6-high',     use: '一般推理、编程、提示词',       vision: true,  image: false },
    { model: 'gpt-6.1-sol',                use: '一般推理、编程、提示词',       vision: true,  image: false },
    { model: 'doubao-seed-2-1-pro-260915', use: '聪明版豆包，一般推理',         vision: true,  image: false }
  ],

  // ⑤ 免费联网搜索 Key（Tavily）说明
  searchTitle: '免费获取「联网搜索」Key（可选）',
  searchSteps: [
    '打开 https://tavily.com 注册一个账号（免费，每月有一定额度）。',
    '登录后进入控制台，复制以 tvly- 开头的 API Key。',
    '回到 Ember → 设置 → 联网搜索 → 粘贴这个 Key → 保存。',
    '之后 Agent 和对话里的「联网搜索」就能用了（每个账号每个月约 1000 次，一般足够）。'
  ],
  searchNote: '不填也能正常使用，只是不能用联网搜索。',

  // ⑥ 底部小字
  footerTip: 'Key 相当于账号密码，不要发给别人，也不要截图晒出去。'
};
