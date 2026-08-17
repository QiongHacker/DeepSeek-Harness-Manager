# DSH Manager

DeepSeek Harness 图形化管理器 —— 告别命令行，一键 **启动 / 停止 / 版本更新**。

## 使用

直接双击运行 `dist/DSH-Manager-1.0.0-portable.exe`（单文件便携版，无需安装）。

| 功能 | 说明 |
| --- | --- |
| ▶ 启动 | 在配置的目录中执行 `pnpm dsh web` 启动 Harness，启动成功后可选自动打开网页 |
| ■ 停止 | 停止由本应用启动的实例；若检测到外部启动的实例（端口被占用），会先询问确认再整树终止 |
| 🚀 一键部署 | 概览页「环境与部署」面板**始终展示**：部署状态 + Git/Node.js/pnpm 环境检查；未部署时可一键克隆 → 安装依赖 → 启动；已部署时可重新部署（确认后停止服务、清空目录重装）。启动前会自动检查环境，缺工具时明确提示并打开官方下载页 |
| 🔍 检查更新 | `git fetch` 后对比本地与远程 master，显示落后/领先的提交数 |
| ⬇ 立即更新 | `git pull --ff-only`；若 `pnpm-lock.yaml` 变化则自动执行 `pnpm install --frozen-lockfile`；若 Harness 正在运行，更新后自动重启 |
| 打开网页 | 在浏览器打开 `http://127.0.0.1:3080` |
| 打开文件夹 | 打开 Harness 所在目录 |
| 🔑 API 绑定 | 设置页填写 Base URL / API Key（支持 DeepSeek 预设与自定义 OpenAI 兼容端点），保存写入 `~/.dsh/settings.yaml` 与 `.credentials.yaml`（官方配置，运行中热更新立即生效）；「打开平台」一键跳转 API 管理平台 |
| 📊 Token 统计 | 读取 `~/.dsh/sessions` 会话日志（含 zstd 压缩）聚合：输入/输出/缓存读/缓存写/推理 Token、缓存命中率、按模型费用估算（基于公开定价，可在配置 `apiPricing` 覆盖）|
| 🧩 插件管理 | 查看已安装插件（版本/启用状态/内置标识）、在线安装（`dsh plugin --profile web add <包名>`，支持 npm 包/git 地址）、一键卸载；安装卸载后重启 Harness 生效 |

### 💾 缓存与磁盘占用

一键部署会把所有大数据都放在部署目录内，**不占用 C 盘系统空间**：
- 代码仓库 → 部署目录（如 `D:\Programe\deepseek-harness`）
- `node_modules` 依赖 → 部署目录下
- pnpm 依赖缓存 store → 部署目录下的 `.pnpm-store`（自动写入该目录 `.npmrc`）

### 🌐 联网与国内镜像

- 首次部署**必须联网**（克隆仓库 + 下载 npm 依赖）
- 克隆失败时**自动切换到国内 Git 镜像**（默认 `https://ghfast.top/...`，可在「设置 → 下载镜像」中修改）
- npm 依赖下载失败时**自动用国内镜像** `https://registry.npmmirror.com` 重试
- 通过镜像克隆成功后，「检查更新」会继续使用该镜像源

- **Harness 目录** 可在界面中修改并保存（默认 `D:\Programe\deepseek-harness`），配置保存于用户数据目录。
- 界面中的**运行日志**实时显示启动/停止/更新过程的全部输出。
- 关闭管理器窗口不影响 Harness 运行（它继续在后台服务）。

## 开发 / 重新构建

```powershell
pnpm install          # 安装依赖（Electron 二进制经 npmmirror 镜像下载）
pnpm test             # 核心逻辑端到端测试（临时 git 仓库模拟启动/停止/更新）
pnpm run icon         # 重新生成图标（Electron 渲染官方鱼形 logo → icon.png/icon.ico）
pnpm start            # 开发模式运行（electron .）
pnpm run dist         # 打包 portable 单文件 exe → 输出到 dist/
```

## 目录结构

```
main.js                 Electron 主进程：窗口、IPC、冒烟/截图调试入口
preload.js              安全桥接（contextBridge）
core/service.js         纯 Node 服务层：状态检测、进程管理、git 操作（可独立测试）
core/service.test.js    核心逻辑端到端测试
renderer/               界面（HTML/CSS/JS，浅色主题）
scripts/                图标生成脚本
build/                  应用图标（icon.png / icon.ico）
dist/                   打包输出（portable 成品与可再生成的中间产物）
```

## 备注

- 应用未签名，首次运行若 Windows Defender 提示，选择「仍要运行」即可。
- 更新功能作用于 Harness 源码仓库（git pull），不含管理器自身的自动更新。

## 许可证

[MIT](LICENSE)
