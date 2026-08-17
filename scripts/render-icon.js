'use strict';

// 用 Electron 离屏渲染生成带官方鱼形 logo 的应用图标 build/icon.png (512x512)
// 用法: npx electron scripts/render-icon.js   （之后运行 node scripts/make-ico.mjs 生成 ico）

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const logo = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'logo.svg'), 'utf8');
const logoStyled = logo.replace('<svg ', '<svg style="width:300px;height:auto" ');
const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;width:512px;height:512px;background:transparent">
<div style="width:512px;height:512px;border-radius:112px;background:linear-gradient(135deg,#4176e6,#679efe);display:flex;align-items:center;justify-content:center;box-sizing:border-box">
${logoStyled}
</div>
</body></html>`;

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      width: 512, height: 512, show: false, frame: false, transparent: true,
      webPreferences: { offscreen: true }
    });
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    await new Promise(r => setTimeout(r, 2000));
    const img = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
    const out = path.join(__dirname, '..', 'build', 'icon.png');
    fs.writeFileSync(out, img.toPNG());
    console.log('icon.png rendered: ' + out + ' (' + img.getSize().width + 'x' + img.getSize().height + ')');
  } catch (e) {
    console.error('render failed: ' + e);
    process.exitCode = 1;
  } finally {
    app.quit();
  }
});
