// build-config.js —— 打包前生成标题模式配置，并自动执行 electron-builder
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const mode = process.argv[2] === 'locked' ? 'locked' : 'editable';

const file = path.join(__dirname, 'js', 'title-mode.js');
fs.writeFileSync(file, `window.TITLE_MODE = '${mode}';\n`);
console.log(`[标题模式] 已生成 js/title-mode.js → ${mode}`);

// 设置 exe 命名后缀（传给 electron-builder 的 ${env.EXE_SUFFIX}）
process.env.EXE_SUFFIX = mode;

console.log(`[打包] 开始生成 ${mode} 版...`);
try {
  execSync('electron-builder --win portable', { stdio: 'inherit', env: process.env });
} catch (e) {
  process.exit(1);
}
