// ============================================================================
// js/github-auth.js —— GitHub 授权（Device Flow，设备码流程）
//
// 为什么用设备码流程：
//   · 用户不用去网页里找 Token、勾权限、复制粘贴（对小白太劝退）
//   · 只需要把 8 位码输进网页，点一下授权
//   · 设备码流程**不需要 client_secret**，桌面应用按官方推荐就该这么用
//
// 数据流：
//   Ember(主进程) → github.com/login/device/code  拿 user_code + device_code
//                  → 用户在浏览器输 user_code 并授权
//   Ember 轮询      → github.com/login/oauth/access_token  （间隔 ≥ interval 秒）
//                  → 拿到 access_token（只在用户机器上，不回传任何服务器）
//
// 为什么放在主进程：
//   github.com 的登录相关接口不支持跨域（CORS），渲染进程 fetch 会被拦。
//   主进程直接用 https 请求，没有这个限制。
// ============================================================================
const { ipcMain, shell, net } = require('electron');

// ★★★ 把你在 GitHub 注册的 OAuth App 的 Client ID 填在这里 ★★★
// 位置：GitHub → Settings → Developer settings → OAuth Apps → 你的 App
// 注意：是 Client ID（公开的），不是 Client secret（那个这里用不到）
const CLIENT_ID = 'Ov23liO3dL5LJR1xxvoS';

const SCOPE = 'repo';                     // 建仓库 + 传文件 + 开 Pages 需要 repo
const UA = 'Ember-App';                   // GitHub 要求带 User-Agent

// 发一个表单 POST，返回解析后的 JSON（github.com/login/* 都要 x-www-form-urlencoded）
// ★ 用 Electron 的 net 而不是 node 的 https：
//   node 的 https 完全不管系统代理，国内用户开着 Clash 也连不上 github.com；
//   net 走 Chromium 的网络栈，会自动使用系统代理设置。
function postForm(pathname, params) {
  return new Promise(function (resolve, reject) {
    const body = Object.keys(params)
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
      .join('&');
    let done = false;
    const finish = function (fn, arg) { if (!done) { done = true; clearTimeout(timer); fn(arg); } };

    let req;
    try {
      req = net.request({ method: 'POST', url: 'https://github.com' + pathname, redirect: 'follow' });
    } catch (e) {
      return reject(e);
    }

    const timer = setTimeout(function () {
      try { req.abort(); } catch (e) {}
      finish(reject, new Error('连接 GitHub 超时（如果打不开 GitHub 站点，请先开代理）'));
    }, 25000);

    req.setHeader('Accept', 'application/json');
    req.setHeader('Content-Type', 'application/x-www-form-urlencoded');
    req.setHeader('User-Agent', UA);

    req.on('response', function (res) {
      let data = '';
      res.on('data', function (chunk) { data += chunk.toString(); });
      res.on('end', function () {
        let json = null;
        try { json = JSON.parse(data); } catch (e) {}
        if (!json) return finish(reject, new Error('返回格式异常：' + String(data).slice(0, 160)));
        if (json.error && json.error !== 'authorization_pending' && json.error !== 'slow_down') {
          return finish(reject, new Error(json.error_description || json.error));
        }
        finish(resolve, json);
      });
      res.on('error', function (e) { finish(reject, e); });
    });

    req.on('error', function (e) {
      const msg = (e && e.message) || '网络错误';
      finish(reject, new Error(/ERR_CONNECTION|ERR_NAME|ERR_PROXY|ERR_TIMED/i.test(msg)
        ? '连不上 GitHub（国内网络通常需要开代理才能访问 github.com）'
        : msg));
    });

    req.write(body);
    req.end();
  });
}

function registerGithubAuthIPC() {
  // ① 申请设备码
  ipcMain.handle('gh-device-start', async function () {
    try {
      if (!CLIENT_ID || CLIENT_ID === 'REPLACE_WITH_YOUR_CLIENT_ID') {
        return { ok: false, error: '尚未配置 OAuth App 的 Client ID（开发者需要在 js/github-auth.js 里填写）' };
      }
      const r = await postForm('/login/device/code', { client_id: CLIENT_ID, scope: SCOPE });
      if (!r.device_code) return { ok: false, error: '申请设备码失败，请稍后重试' };
      return {
        ok: true,
        deviceCode: r.device_code,
        userCode: r.user_code,
        verificationUri: r.verification_uri || 'https://github.com/login/device',
        expiresIn: r.expires_in || 900,
        interval: r.interval || 5
      };
    } catch (e) {
      return { ok: false, error: (e && e.message) || String(e) };
    }
  });

  // ② 用设备码换 access_token（一次调用，是否已授权由返回的 error 字段表示）
  //    渲染进程按 interval 定时调它，直到 authorized 或 超时
  ipcMain.handle('gh-device-poll', async function (event, deviceCode) {
    try {
      if (!deviceCode) return { ok: false, error: '缺少设备码' };
      const r = await postForm('/login/oauth/access_token', {
        client_id: CLIENT_ID,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      });
      if (r.access_token) {
        // ★ 把 refresh_token / expires_in 一起交给渲染进程存下来。
        //   GitHub App 的用户令牌默认 8 小时过期，只存 access_token 的话，
        //   8 小时后必然 401（用户什么都没做也会掉线）。有 refresh 才能自动续期。
        return {
          ok: true,
          authorized: true,
          token: r.access_token,
          scope: r.scope || '',
          refreshToken: r.refresh_token || '',
          expiresIn: r.expires_in || 0
        };
      }
      if (r.error === 'authorization_pending') return { ok: true, authorized: false, pending: true };
      if (r.error === 'slow_down') return { ok: true, authorized: false, pending: true, slowDown: true };
      if (r.error === 'expired_token') return { ok: false, error: '这个码已经过期了，请重新连接' };
      if (r.error === 'access_denied') return { ok: false, error: '你取消了授权' };
      return { ok: false, error: '授权失败，请重试' };
    } catch (e) {
      return { ok: false, error: (e && e.message) || String(e) };
    }
  });

  // ③ 用 refresh_token 换新的 access_token（自动续期）
  //    GitHub App 的用户令牌 8 小时过期；有 refresh_token 就能在过期前换新的，
  //    用户不会再"什么都没做就掉线"。
  ipcMain.handle('gh-refresh', async function (event, refreshToken) {
    try {
      const rt = String(refreshToken || '').trim();
      if (!rt) return { ok: false, error: '没有 refresh_token，无法自动续期' };
      const r = await postForm('/login/oauth/access_token', {
        client_id: CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: rt
      });
      if (r.access_token) {
        return {
          ok: true,
          token: r.access_token,
          refreshToken: r.refresh_token || rt,
          expiresIn: r.expires_in || 0,
          scope: r.scope || ''
        };
      }
      return { ok: false, error: r.error_description || r.error || '续期失败' };
    } catch (e) {
      return { ok: false, error: (e && e.message) || String(e) };
    }
  });

  // ④ 打开系统浏览器到授权页
  ipcMain.handle('gh-open-verify', async function (event, url) {
    try {
      const u = String(url || '').trim();
      if (!/^https:\/\/github\.com\/login\/device/i.test(u)) return { ok: false, error: '地址不合法' };
      await shell.openExternal(u);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e && e.message) || String(e) };
    }
  });
}

module.exports = { registerGithubAuthIPC, CLIENT_ID };
