<div align="center">
  <img src="build/icon.png" width="96" alt="DSH Manager 图标" />
  <h1>DeepSeek Harness Manager</h1>
  <p>面向 Windows 的现代化 DeepSeek Harness 图形管理器。</p>

  [English](README.md) · [简体中文](README.zh-CN.md)

  [![Release](https://img.shields.io/github/v/release/QiongHacker/DeepSeek-Harness-Manager?display_name=tag)](https://github.com/QiongHacker/DeepSeek-Harness-Manager/releases/latest)
  [![Windows](https://img.shields.io/badge/Windows-10%20%2F%2011-4D6BFE)](https://github.com/QiongHacker/DeepSeek-Harness-Manager/releases/latest)
  [![License](https://img.shields.io/github/license/QiongHacker/DeepSeek-Harness-Manager)](LICENSE)
</div>

> 这是一个社区桌面管理器。DeepSeek Harness 本体仍遵循其自身仓库与许可证。

## 下载

两种构建均可从 [GitHub 最新 Release](https://github.com/QiongHacker/DeepSeek-Harness-Manager/releases/latest) 下载。

| 安装包 | 适合场景 | 使用方式 |
| --- | --- | --- |
| `DSH-Manager-1.0.0-windows-x64.zip` | **推荐，启动更快** | 只需解压一次，运行文件夹内的 `DSH Manager.exe`；请保留全部解压文件。 |
| `DSH-Manager-1.0.0-portable.exe` | 方便携带的单文件版本 | 直接运行，无需安装；但每次启动都要把内置 Electron 运行时解压到临时目录，所以会更慢。 |

应用目前没有代码签名。Windows SmartScreen 首次运行时可能提示风险；建议先核对 Release 校验值，再选择“仍要运行”。

## 功能

| 模块 | 能力 |
| --- | --- |
| 绑定已有 Harness | 选择已有 DeepSeek Harness 源码仓库，验证目录结构后立即接管版本和进程管理；普通 Node.js 目录会被拒绝。 |
| 一键部署 | 自动克隆 Harness、将 pnpm 缓存放在部署目录内、安装依赖并启动 Web profile。 |
| 进程管理 | 执行 `pnpm dsh web`，检测端口 `3080` 上的已有实例，停止管理器启动或经确认的外部实例，并打开 Web 界面。 |
| 版本管理 | 读取包版本与 Git 提交，识别实际上游分支，对比本地/远程提交，安全快进，依赖变化时重新安装并按需重启。 |
| API 绑定 | 将 DeepSeek 或 OpenAI 兼容端点与 API Key 保存到 `~/.dsh` 官方配置。 |
| Token 统计 | 汇总普通和 zstd 压缩的会话日志，展示分类 Token、缓存命中率、模型汇总与费用估算。 |
| 插件管理 | 查看已安装插件，安装 pnpm 支持的 npm/Git spec，并卸载当前 profile 的插件。 |
| 现代界面 | DeepSeek 风格浅色/深色主题、中英文切换、偏好持久化，并自适应到 `680 × 520`。 |

## 系统要求

- Windows 10 或 Windows 11，x64。
- Git 已加入 `PATH`，用于部署与版本更新。
- Node.js `^22.19.0` 或 `>=24.0.0`。
- pnpm 已加入 `PATH`。
- 新部署、依赖/插件安装与远程更新检查需要联网。

如果电脑中已经有 Harness，请选择它的**仓库根目录**，即包含根 `package.json` 与 pnpm 工作区文件的目录。

## 快速开始

1. 下载并解压推荐的 ZIP 构建，或下载单文件便携版。
2. 启动 DSH Manager。
3. 在“概览”页选择一种方式：
   - 点击“绑定已有 Harness”，选择已有源码仓库；
   - 点击“一键下载并部署”，创建全新副本。
4. 如果尚未配置 API，前往“设置 → API 绑定”填写端点与 API Key。
5. 点击“启动”，随后点击“打开网页”。

如需切换到另一个仓库，请先停止当前 Harness，再前往“设置 → Harness 目录 → 选择目录”。

## 存储与配置

- 管理器偏好保存在 Electron 的当前用户应用数据目录。
- Harness 设置和凭据写入 `~/.dsh/settings.yaml` 与 `~/.dsh/.credentials.yaml`。
- Token 统计读取 `~/.dsh/sessions`。
- 管理器创建的部署会把 `node_modules`、`.pnpm-store` 和生成的 `.npmrc` 放在所选部署目录内。
- 关闭 DSH Manager 不会停止 Harness，服务可继续在后台运行。

默认仓库路径为 `%USERPROFILE%\deepseek-harness`，可在界面中绑定任意有效仓库来替换，也可通过 `DSH_CHECKOUT` 环境变量指定。

## 网络回退

- 默认源码为 `https://github.com/deepseek-ai/deepseek-harness.git`。
- 克隆失败时自动尝试配置的 Git 镜像。
- 依赖安装失败时自动改用 `https://registry.npmmirror.com` 重试。
- 更新检查会跟随绑定仓库的实际上游分支，不再假定必须是 `master` 或 `main`。

## 仓库结构

源码仓库有意不提交生成的安装包。`dist/` 已被忽略，二进制文件通过 GitHub Release 附件发布。

```text
DeepSeek-Harness-Manager/
├─ .gitattributes               跨平台文本规范
├─ .github/
│  ├─ release-notes/
│  │  └─ v1.0.0.md             首个版本的中英文发布说明
│  └─ workflows/
│     └─ release.yml           Windows 验证、构建与发布自动化
├─ .gitignore                   构建与运行文件忽略规则
├─ build/
│  ├─ icon.ico                 Windows 应用图标
│  └─ icon.png                 README 与源码图标
├─ core/
│  ├─ service.js               进程、部署、Git、API 与插件服务
│  ├─ service.test.js          临时仓库/服务驱动的核心端到端测试
│  ├─ stats.js                 会话统计与费用估算
│  └─ stats-worker.js          后台统计 Worker
├─ renderer/
│  ├─ index.html               应用界面结构
│  ├─ renderer.js              界面状态、本地化与交互
│  ├─ styles.css               响应式 DeepSeek 浅色/深色主题
│  └─ logo.svg                 应用内鱼形标志
├─ scripts/
│  ├─ make-ico.mjs             ICO 生成脚本
│  ├─ make-icon.ps1            Windows 图标辅助脚本
│  └─ render-icon.js           Electron 图标渲染脚本
├─ main.js                     Electron 主进程、IPC 与诊断入口
├─ preload.js                  隔离环境下的渲染进程桥接
├─ package.json                脚本、依赖与双 Windows 构建配置
├─ pnpm-lock.yaml              JavaScript 依赖锁文件
├─ pnpm-workspace.yaml         pnpm 工作区声明
├─ README.md                   英文默认文档
├─ README.zh-CN.md             简体中文文档
└─ LICENSE                     MIT 许可证
```

以下内容在本地生成，但不进入 Git：

```text
dist/
├─ DSH-Manager-1.0.0-portable.exe
├─ DSH-Manager-1.0.0-windows-x64.zip
└─ win-unpacked/               临时/完整构建目录
```

## 开发

```powershell
pnpm install
pnpm test
pnpm start
```

构建命令：

```powershell
pnpm run dist            # 同时构建便携 EXE 和完整 ZIP
pnpm run dist:portable   # 只构建单文件便携 EXE
pnpm run dist:zip        # 只构建解压即用 ZIP
pnpm run pack            # 构建未压缩的 Windows 目录
pnpm run icon            # 重新生成 icon.png 与 icon.ico
```

`pnpm test` 覆盖已有仓库绑定与错误目录拒绝、启动/停止、外部端口检测、上游更新检查、安全快进、部署/重新部署、镜像回退、API 持久化、Token 统计、插件以及服务层中英文日志。Electron 冒烟测试额外检查导航、主题、语言切换、响应式布局和渲染错误。

## 常见问题

### 单文件便携版启动很慢

便携目标是 NSIS 自解压程序。每次启动都会删除并重建临时应用目录、解压完整 Electron 运行时、启动应用，并在退出后删除临时目录；杀毒软件扫描还会增加等待时间。日常使用建议下载完整 ZIP，解压一次后直接运行 `DSH Manager.exe`。

### 绑定后无法检查版本更新

有效的 Harness 源码压缩包仍可绑定并启动，但版本比较与快进更新要求该目录是带有 `origin` 远程/上游分支的 Git 仓库。

### Harness 无法启动

在“概览”页运行“环境检查”，并查看“运行日志”。确认所选目录是 Harness 仓库根目录，且 Git、Node.js、pnpm 满足上述版本要求。

## 许可证

[MIT](LICENSE) © QiongHacker
