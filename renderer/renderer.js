'use strict';

window.__errs = [];
window.addEventListener('error', e => window.__errs.push(String(e.message || e)));

const $ = s => document.querySelector(s);
const now = () => new Date().toLocaleTimeString(currentLanguage, { hour12: false });

const THEME_KEY = 'dsh-manager-theme';

const I18N = {
  'zh-CN': {
    'brand.subtitle': 'DeepSeek Harness 管理器',
    'nav.overview': '概览', 'nav.update': '版本更新', 'nav.settings': '设置',
    'nav.stats': 'Token 统计', 'nav.plugins': '插件', 'nav.logs': '运行日志',
    'sidebar.statusTitle': 'Harness 运行状态', 'sidebar.quitTitle': '退出管理器（不影响 Harness 运行）',
    'common.quit': '退出', 'common.save': '保存', 'common.start': '启动', 'common.stop': '停止',
    'common.openWeb': '打开网页', 'common.version': '版本', 'common.port': '端口',
    'common.directory': '目录', 'common.refresh': '刷新', 'common.clear': '清空',
    'overview.title': '概览', 'overview.subtitle': 'Harness 运行状态与常用操作',
    'deploy.title': '环境与部署', 'deploy.check': '环境检查',
    'deploy.checkTitle': '立即重新检测 Git / Node.js / pnpm', 'deploy.redeploy': '重新部署',
    'deploy.redeployTitle': '停止服务并重新克隆部署', 'deploy.status': '部署状态',
    'deploy.directory': '部署目录', 'deploy.download': '一键下载并部署',
    'deploy.bindExisting': '绑定已有 Harness',
    'update.title': '版本更新', 'update.subtitle': '从 GitHub 拉取最新代码，依赖变化时自动安装',
    'update.currentVersion': '当前版本', 'update.currentCommit': '当前提交', 'update.servicePort': '服务端口',
    'update.check': '检查更新', 'update.now': '立即更新', 'update.hint': '点击「检查更新」查看是否有新版本',
    'update.note': '更新流程：获取实际上游分支并快进 → （若 lockfile 变化）安装依赖 → 若服务运行中自动重启。',
    'settings.title': '设置', 'settings.subtitle': '配置 Harness 安装目录与启动行为',
    'settings.harnessDir': 'Harness 目录', 'settings.pathPlaceholder': '例如 C:\\Users\\你的用户名\\deepseek-harness',
    'settings.bindPath': '验证并绑定', 'settings.choosePath': '选择目录',
    'settings.openFolder': '打开文件夹', 'settings.mirror': '下载镜像（可选）',
    'settings.mirrorNote': '首次部署必须联网。默认只信任官方 GitHub 源；仅在你明确填写 HTTPS 镜像后才会回退使用（npm 依赖失败仍会用带完整性校验的国内镜像重试）。',
    'settings.openAfterStart': '启动成功后自动打开网页',
    'settings.envNote': '「概览」页的环境与部署面板会持续显示部署状态与环境检查结果（Git / Node.js / pnpm），缺少工具时启动会提前给出明确提示。',
    'maintenance.title': '环境迁移与卸载', 'maintenance.subtitle': '一键导出或恢复可迁移环境，并按所选范围清理本机数据',
    'maintenance.export': '仅导出环境包', 'maintenance.exportLauncher': '连同启动器导出', 'maintenance.import': '导入并绑定',
    'maintenance.migrationNote': '“连同启动器导出”生成解压即用的完整 ZIP：运行 DSH Manager.exe 后自动绑定随包环境，首次启动自动安装依赖。两种导出都排除 API Key、凭据、会话和日志；目标电脑需重新填写 API Key。',
    'maintenance.removeDshHome': '同时删除 Harness 用户数据（API Key、会话、插件配置）',
    'maintenance.removeCheckout': '同时删除已绑定的 Harness 源码目录',
    'maintenance.uninstall': '干净卸载并退出',
    'maintenance.uninstallNote': '默认只清理管理器设置与缓存。便携版不注册系统安装项，数据清理后手动删除下载的 EXE 或整个解压目录即可。',
    'api.title': 'API 绑定', 'api.unbound': '未绑定', 'api.provider': '服务商',
    'api.deepseek': 'DeepSeek（默认）', 'api.custom': '自定义（OpenAI 兼容）', 'api.platform': '管理平台',
    'api.openPlatform': '打开平台', 'api.save': '保存 API',
    'api.hint': 'API Key 将写入 ~/.dsh（Harness 官方配置，运行中即刻生效）', 'api.toggleKey': '显示/隐藏',
    'about.basedOn': '基于 Electron', 'about.description': 'DeepSeek Harness 图形化管理器：一键启动 / 停止 / 版本更新。',
    'about.note': '更新功能作用于 Harness 源码仓库；管理器自身不自动更新。',
    'stats.title': 'Token 统计', 'stats.subtitle': '基于会话日志聚合的用量与计费估算',
    'stats.totalTokens': '总 Token', 'stats.hitRate': '缓存命中率', 'stats.cost': '计费估算 (USD)',
    'stats.llmCalls': 'LLM 调用', 'stats.composition': 'Token 构成', 'stats.details': '用量明细',
    'stats.detailsSubtitle': '按月、日或小时查看 Token 用量', 'stats.timelineAria': '{period} Token 用量柱状图',
    'stats.periodAria': '统计周期', 'stats.periodMonth': '月', 'stats.periodDay': '日', 'stats.periodHour': '小时',
    'stats.rangeMonth': '最近 12 个月', 'stats.rangeDay': '最近 30 天', 'stats.rangeHour': '最近 24 小时',
    'stats.timelineTokens': 'Token', 'stats.timelineCalls': '调用', 'stats.timelineEmpty': '暂无可按时间展示的 Token 用量',
    'stats.byModel': '按模型', 'stats.model': '模型', 'stats.calls': '调用', 'stats.input': '输入',
    'stats.cacheRead': '缓存读', 'stats.cacheWrite': '缓存写', 'stats.outputReasoning': '输出+推理',
    'stats.total': '合计', 'stats.costUsd': '费用 (USD)',
    'plugins.title': '插件管理', 'plugins.subtitle': '本地插件查看与卸载，在线安装新插件（官方 dsh plugin 机制）',
    'plugins.onlineInstall': '在线安装', 'plugins.spec': '包名 / spec',
    'plugins.specPlaceholder': '例如 @deepseek-ai/dsh-xxx（仅安装你信任的来源）', 'plugins.install': '安装',
    'plugins.note': '安全提示：插件属于可执行代码，运行后可能读取 Harness API Key。只安装你审查并信任的 npm/Git 来源；安装/卸载后需重启 Harness。',
    'plugins.installed': '已安装插件',
    'logs.title': '运行日志', 'logs.subtitle': '启动 / 停止 / 更新过程的实时输出', 'logs.autoScroll': '自动滚动',
    'theme.switchLight': '切换到浅色模式', 'theme.switchDark': '切换到深色模式',
    'theme.light': '浅色', 'theme.dark': '深色', 'language.switch': 'Switch to English', 'language.label': 'EN',
    'status.running': '运行中', 'status.runningExternal': '运行中 · 外部实例', 'status.starting': '启动中…',
    'status.stopping': '停止中…', 'status.updating': '更新中…', 'status.deploying': '部署中…',
    'status.stopped': '已停止', 'status.unknown': '未知', 'status.checking': '检测中…',
    'deploy.deployed': '已部署 · 版本 {version} @ {head}', 'deploy.notDeployed': '未部署',
    'deploy.warnNotDeployed': '尚未连接 Harness。电脑中已有 Harness 可直接选择目录绑定；否则点击「一键下载并部署」。首次部署需要联网。',
    'deploy.nodeTooOld': 'Node.js 版本过低（需 ^22.19.0 或 >=24）',
    'deploy.warnEnv': '⚠ 环境异常：缺少 {missing}，可能导致启动失败。请安装所需工具后点击「环境检查」，或点击「重新部署」。',
    'api.bound': '已绑定 {key}', 'api.keyPlaceholder': '已绑定 {key}',
    'stats.calculating': '统计计算中…', 'stats.readFailed': '统计读取失败：{error}', 'stats.noData': '暂无数据',
    'stats.progressScanning': '正在扫描会话文件…', 'stats.progressProcessing': '正在统计：{processed}/{total} 个文件',
    'stats.progressSaving': '正在保存增量缓存…', 'stats.progressDone': '统计完成',
    'stats.dataNote': '数据目录：{root} · 更新于 {time} · 费用为按公开定价的估算值',
    'stats.sessions': '会话数', 'stats.turns': '对话轮次', 'stats.steps': '步骤数',
    'stats.userMessages': '用户消息', 'stats.toolCalls': '工具调用', 'stats.inputUncached': '输入（未缓存）',
    'stats.cacheHit': '缓存命中', 'stats.cacheWritten': '缓存写入', 'stats.output': '输出', 'stats.reasoning': '推理',
    'plugins.loading': '加载中…', 'plugins.readFailed': '读取失败',
    'plugins.uninitialized': 'profile 尚未初始化，安装第一个插件时会自动创建',
    'plugins.profile': 'profile：{profile}（{dir}）', 'plugins.enabled': '已启用',
    'plugins.dependency': '普通依赖', 'plugins.builtIn': '内置', 'plugins.uninstall': '卸载',
    'plugins.empty': '暂无已安装的第三方插件',
    'plugins.profileNote': 'profile：{profile} · 目录：{dir} · 卸载后需重启 Harness 生效',
    'plugins.listFailed': '插件列表读取失败：{error}',
    'toast.checkoutMissing': '⚠ 未找到 Harness 目录，请检查路径设置',
    'confirm.pluginInstall': '将安装插件：{spec}\n\n插件属于可执行代码，可能读取你的 Harness API Key。请确认来源可信；安装后需重启 Harness。继续吗？',
    'confirm.pluginUninstall': '确定卸载插件 {name} 吗？卸载后需重启 Harness 生效。',
    'confirm.stopExternal': '检测到由外部启动的 Harness 实例，确定要终止它吗？',
    'confirm.redeploy': '重新部署将停止服务、删除现有目录并重新下载安装，确定继续吗？',
    'confirm.cleanUninstall': '将清理管理器数据并退出。所选的 Harness 数据会永久删除，是否继续核对删除清单？',
    'log.installPlugin': '—— 用户点击：安装插件 {spec} ——', 'log.uninstallPlugin': '—— 用户点击：卸载插件 {name} ——',
    'log.start': '—— 用户点击：启动 ——', 'log.stop': '—— 用户点击：停止 ——', 'log.action': '—— 用户点击：{action} ——',
    'toast.pluginSpecRequired': '请输入插件包名', 'toast.pluginInstalled': '✅ 插件安装完成，重启 Harness 后生效',
    'toast.pluginNotDeployed': '⚠ 未部署 Harness，无法管理插件', 'toast.pluginInstallFailed': '安装失败，请查看日志',
    'toast.pluginUninstalled': '✅ 插件已卸载，重启 Harness 后生效', 'toast.pluginUninstallFailed': '卸载失败，请查看日志',
    'toast.alreadyRunning': 'Harness 已在运行', 'toast.startOpened': '✅ 启动成功，正在打开网页…',
    'toast.startSuccess': '✅ 启动成功', 'toast.missingEnv': '⚠ 环境缺少必要工具，请查看「环境与部署」面板',
    'toast.startFailed': '启动失败，请查看日志', 'toast.stopped': '已停止',
    'toast.missingTool': '缺少 {tool}，正在打开下载页面…', 'toast.deployStarting': '✅ 部署完成，正在启动…',
    'toast.deployOpen': '✅ 部署完成，正在打开网页…', 'toast.deploySuccess': '✅ 部署完成，Harness 已启动',
    'toast.deployStartFailed': '部署完成，但启动失败，请查看日志',
    'toast.dirNotEmpty': '⚠ 部署目录非空且不是 Harness 仓库，请在设置中更换目录',
    'toast.cloneFailed': '下载仓库失败，请检查网络后重试', 'toast.dependenciesFailed': '依赖安装失败，请查看日志',
    'toast.harnessExists': 'Harness 已存在', 'toast.deployFailed': '部署失败：{reason}',
    'toast.envCheckFailed': '环境检查失败', 'toast.nodeTooOld': 'Node.js 版本过低', 'toast.harnessNotDeployed': 'Harness 未部署',
    'toast.envIssues': '环境检查：{missing}', 'toast.envPassed': '✅ 环境检查通过',
    'update.checking': '正在检查…', 'update.found': '发现 {count} 个新提交（{local} → {remote}）',
    'toast.newVersion': '发现新版本，可点击「立即更新」', 'update.latest': '已是最新（{head}）',
    'toast.latest': '✅ 已是最新版本', 'update.checkFailed': '检查失败', 'toast.updateCheckFailed': '检查更新失败，请查看日志',
    'update.updating': '更新中…', 'toast.updateRestarting': '更新完成，正在重启服务…',
    'toast.updateRestarted': '✅ 更新并重启成功', 'toast.restartFailed': '重启失败，请手动点击启动',
    'toast.updated': '✅ 更新完成', 'toast.updateFailed': '更新失败，请查看日志',
    'toast.bindSuccess': '✅ 已绑定 Harness {version}：{path}',
    'toast.bindNonGit': '已绑定并可启动，但该目录不是 Git 仓库，无法检查版本更新',
    'toast.bindInvalid': '所选目录不是有效的 DeepSeek Harness 源码目录',
    'toast.bindNotFound': '目录不存在或无法访问', 'toast.bindRunning': '请先停止当前 Harness，再切换绑定目录',
    'toast.bindFailed': '绑定失败：{reason}', 'toast.mirrorSaved': '已保存下载镜像：{mirror}',
    'toast.mirrorCleared': '已清除下载镜像（仅使用官方 GitHub 源）', 'toast.openingPlatform': '正在打开 API 管理平台…',
    'toast.apiKeyRequired': '⚠ 请填写 API Key', 'toast.baseUrlRequired': '⚠ 请填写 Base URL',
    'toast.apiSaved': '✅ API 已保存，立即生效', 'toast.saveFailed': '保存失败：{reason}',
    'toast.exported': '✅ 环境迁移包已创建', 'toast.imported': '✅ 环境已迁移、绑定并完成依赖安装',
    'toast.launcherExported': '✅ 启动器与便携环境已打包，解压后运行 DSH Manager.exe 即可',
    'toast.importedNeedsInstall': '环境已迁移并绑定，但依赖安装未完成，请查看日志',
    'toast.migrationFailed': '环境迁移失败：{reason}', 'toast.cleanupFailed': '卸载清理无法启动：{reason}',
    'common.unknownReason': '未知原因'
  },
  'en-US': {
    'brand.subtitle': 'DeepSeek Harness Manager',
    'nav.overview': 'Overview', 'nav.update': 'Updates', 'nav.settings': 'Settings',
    'nav.stats': 'Token Usage', 'nav.plugins': 'Plugins', 'nav.logs': 'Logs',
    'sidebar.statusTitle': 'Harness status', 'sidebar.quitTitle': 'Quit manager (Harness keeps running)',
    'common.quit': 'Quit', 'common.save': 'Save', 'common.start': 'Start', 'common.stop': 'Stop',
    'common.openWeb': 'Open web app', 'common.version': 'Version', 'common.port': 'Port',
    'common.directory': 'Directory', 'common.refresh': 'Refresh', 'common.clear': 'Clear',
    'overview.title': 'Overview', 'overview.subtitle': 'Harness status and common actions',
    'deploy.title': 'Environment & Deployment', 'deploy.check': 'Check environment',
    'deploy.checkTitle': 'Check Git, Node.js, and pnpm again', 'deploy.redeploy': 'Redeploy',
    'deploy.redeployTitle': 'Stop the service and clone a fresh deployment', 'deploy.status': 'Status',
    'deploy.directory': 'Directory', 'deploy.download': 'Download & deploy',
    'deploy.bindExisting': 'Bind existing Harness',
    'update.title': 'Updates', 'update.subtitle': 'Pull the latest code from GitHub and install changed dependencies',
    'update.currentVersion': 'Version', 'update.currentCommit': 'Commit', 'update.servicePort': 'Service port',
    'update.check': 'Check for updates', 'update.now': 'Update now', 'update.hint': 'Check whether a new version is available',
    'update.note': 'Update flow: fetch and fast-forward from the actual upstream branch → install changed dependencies → restart if running.',
    'settings.title': 'Settings', 'settings.subtitle': 'Configure the Harness directory and startup behavior',
    'settings.harnessDir': 'Harness directory', 'settings.pathPlaceholder': 'For example C:\\Users\\you\\deepseek-harness',
    'settings.bindPath': 'Validate & bind', 'settings.choosePath': 'Choose folder',
    'settings.openFolder': 'Open folder', 'settings.mirror': 'Download mirror (optional)',
    'settings.mirrorNote': 'The first deployment requires internet access. Only the official GitHub source is trusted by default; a fallback is used only when you explicitly configure an HTTPS mirror. npm retries use lockfile integrity checks.',
    'settings.openAfterStart': 'Open the web app after startup',
    'settings.envNote': 'The Overview page always shows deployment status and Git / Node.js / pnpm checks, with clear guidance when a tool is missing.',
    'maintenance.title': 'Migration & Removal', 'maintenance.subtitle': 'Export or restore a portable environment and clean selected local data',
    'maintenance.export': 'Environment only', 'maintenance.exportLauncher': 'Export with launcher', 'maintenance.import': 'Import & bind',
    'maintenance.migrationNote': 'Export with launcher creates an extract-and-run ZIP. DSH Manager.exe binds the bundled environment automatically and installs dependencies on first start. Both exports exclude API keys, credentials, sessions, and logs; enter the API key again on the destination computer.',
    'maintenance.removeDshHome': 'Also delete Harness user data (API key, sessions, and plugin configuration)',
    'maintenance.removeCheckout': 'Also delete the bound Harness source checkout',
    'maintenance.uninstall': 'Clean data & quit',
    'maintenance.uninstallNote': 'By default, only manager settings and caches are removed. Portable builds register no system installer; afterward, delete the downloaded EXE or extracted application folder.',
    'api.title': 'API Binding', 'api.unbound': 'Not bound', 'api.provider': 'Provider',
    'api.deepseek': 'DeepSeek (default)', 'api.custom': 'Custom (OpenAI compatible)', 'api.platform': 'Platform',
    'api.openPlatform': 'Open platform', 'api.save': 'Save API',
    'api.hint': 'The API key is saved to ~/.dsh and takes effect immediately', 'api.toggleKey': 'Show or hide key',
    'about.basedOn': 'Built with Electron', 'about.description': 'A graphical manager for starting, stopping, and updating DeepSeek Harness.',
    'about.note': 'Updates apply to the Harness source checkout; the manager does not update itself.',
    'stats.title': 'Token Usage', 'stats.subtitle': 'Usage and cost estimates aggregated from session logs',
    'stats.totalTokens': 'Total tokens', 'stats.hitRate': 'Cache hit rate', 'stats.cost': 'Estimated cost (USD)',
    'stats.llmCalls': 'LLM calls', 'stats.composition': 'Token breakdown', 'stats.details': 'Usage details',
    'stats.detailsSubtitle': 'View token usage by month, day, or hour', 'stats.timelineAria': 'Token usage bar chart by {period}',
    'stats.periodAria': 'Statistics period', 'stats.periodMonth': 'Month', 'stats.periodDay': 'Day', 'stats.periodHour': 'Hour',
    'stats.rangeMonth': 'Last 12 months', 'stats.rangeDay': 'Last 30 days', 'stats.rangeHour': 'Last 24 hours',
    'stats.timelineTokens': 'tokens', 'stats.timelineCalls': 'calls', 'stats.timelineEmpty': 'No timed token usage is available',
    'stats.byModel': 'By model', 'stats.model': 'Model', 'stats.calls': 'Calls', 'stats.input': 'Input',
    'stats.cacheRead': 'Cache read', 'stats.cacheWrite': 'Cache write', 'stats.outputReasoning': 'Output + reasoning',
    'stats.total': 'Total', 'stats.costUsd': 'Cost (USD)',
    'plugins.title': 'Plugin Manager', 'plugins.subtitle': 'View, install, and remove plugins using the official dsh plugin mechanism',
    'plugins.onlineInstall': 'Install online', 'plugins.spec': 'Package / spec',
    'plugins.specPlaceholder': 'For example @deepseek-ai/dsh-xxx (trusted sources only)', 'plugins.install': 'Install',
    'plugins.note': 'Security notice: plugins are executable code and may read the Harness API key. Install only reviewed npm/Git sources you trust. Restart Harness after changes.',
    'plugins.installed': 'Installed plugins',
    'logs.title': 'Runtime Logs', 'logs.subtitle': 'Live output from start, stop, update, and deployment operations', 'logs.autoScroll': 'Auto-scroll',
    'theme.switchLight': 'Switch to light mode', 'theme.switchDark': 'Switch to dark mode',
    'theme.light': 'Light', 'theme.dark': 'Dark', 'language.switch': '切换到中文', 'language.label': '中',
    'status.running': 'Running', 'status.runningExternal': 'Running · external instance', 'status.starting': 'Starting…',
    'status.stopping': 'Stopping…', 'status.updating': 'Updating…', 'status.deploying': 'Deploying…',
    'status.stopped': 'Stopped', 'status.unknown': 'Unknown', 'status.checking': 'Checking…',
    'deploy.deployed': 'Deployed · version {version} @ {head}', 'deploy.notDeployed': 'Not deployed',
    'deploy.warnNotDeployed': 'Harness is not connected. Bind an existing Harness folder, or download and deploy a new copy. Internet access is required for a new deployment.',
    'deploy.nodeTooOld': 'Node.js is too old (requires ^22.19.0 or >=24)',
    'deploy.warnEnv': '⚠ Environment issue: missing {missing}. Install the required tools, then check the environment or redeploy.',
    'api.bound': 'Bound {key}', 'api.keyPlaceholder': 'Bound {key}',
    'stats.calculating': 'Calculating usage…', 'stats.readFailed': 'Unable to read usage: {error}', 'stats.noData': 'No data',
    'stats.progressScanning': 'Scanning session files…', 'stats.progressProcessing': 'Processing {processed} of {total} files',
    'stats.progressSaving': 'Saving incremental cache…', 'stats.progressDone': 'Usage ready',
    'stats.dataNote': 'Data: {root} · Updated {time} · Costs are estimates based on public pricing',
    'stats.sessions': 'Sessions', 'stats.turns': 'Turns', 'stats.steps': 'Steps',
    'stats.userMessages': 'User messages', 'stats.toolCalls': 'Tool calls', 'stats.inputUncached': 'Input (uncached)',
    'stats.cacheHit': 'Cache read', 'stats.cacheWritten': 'Cache write', 'stats.output': 'Output', 'stats.reasoning': 'Reasoning',
    'plugins.loading': 'Loading…', 'plugins.readFailed': 'Unable to load plugins',
    'plugins.uninitialized': 'The profile is not initialized. It will be created when you install the first plugin.',
    'plugins.profile': 'Profile: {profile} ({dir})', 'plugins.enabled': 'Enabled',
    'plugins.dependency': 'Dependency', 'plugins.builtIn': 'Built in', 'plugins.uninstall': 'Uninstall',
    'plugins.empty': 'No third-party plugins installed',
    'plugins.profileNote': 'Profile: {profile} · Directory: {dir} · Restart Harness after uninstalling',
    'plugins.listFailed': 'Unable to read plugin list: {error}',
    'toast.checkoutMissing': '⚠ Harness directory not found. Check the path in Settings.',
    'confirm.pluginInstall': 'Install plugin: {spec}\n\nPlugins are executable code and may read your Harness API key. Confirm that you trust this source. Restart Harness afterward. Continue?',
    'confirm.pluginUninstall': 'Uninstall {name}? Restart Harness afterward to apply the change.',
    'confirm.stopExternal': 'Harness was started outside this manager. Do you want to terminate it?',
    'confirm.redeploy': 'Redeploying stops the service, deletes the current directory, and downloads a fresh copy. Continue?',
    'confirm.cleanUninstall': 'This removes manager data and quits. Selected Harness data will be permanently deleted. Continue to the final deletion review?',
    'log.installPlugin': '—— User action: install plugin {spec} ——', 'log.uninstallPlugin': '—— User action: uninstall plugin {name} ——',
    'log.start': '—— User action: start ——', 'log.stop': '—— User action: stop ——', 'log.action': '—— User action: {action} ——',
    'toast.pluginSpecRequired': 'Enter a plugin package or spec', 'toast.pluginInstalled': '✅ Plugin installed. Restart Harness to apply it.',
    'toast.pluginNotDeployed': '⚠ Deploy Harness before managing plugins', 'toast.pluginInstallFailed': 'Plugin installation failed. Check the logs.',
    'toast.pluginUninstalled': '✅ Plugin removed. Restart Harness to apply it.', 'toast.pluginUninstallFailed': 'Plugin removal failed. Check the logs.',
    'toast.alreadyRunning': 'Harness is already running', 'toast.startOpened': '✅ Started. Opening the web app…',
    'toast.startSuccess': '✅ Harness started', 'toast.missingEnv': '⚠ Required tools are missing. Check Environment & Deployment.',
    'toast.startFailed': 'Unable to start Harness. Check the logs.', 'toast.stopped': 'Harness stopped',
    'toast.missingTool': '{tool} is missing. Opening its download page…', 'toast.deployStarting': '✅ Deployment complete. Starting Harness…',
    'toast.deployOpen': '✅ Deployment complete. Opening the web app…', 'toast.deploySuccess': '✅ Deployment complete. Harness is running.',
    'toast.deployStartFailed': 'Deployment completed, but Harness could not start. Check the logs.',
    'toast.dirNotEmpty': '⚠ The deployment directory is not empty and is not a Harness checkout. Choose another directory.',
    'toast.cloneFailed': 'Unable to download the repository. Check your network and try again.', 'toast.dependenciesFailed': 'Dependency installation failed. Check the logs.',
    'toast.harnessExists': 'Harness is already deployed', 'toast.deployFailed': 'Deployment failed: {reason}',
    'toast.envCheckFailed': 'Environment check failed', 'toast.nodeTooOld': 'Node.js is too old', 'toast.harnessNotDeployed': 'Harness is not deployed',
    'toast.envIssues': 'Environment check: {missing}', 'toast.envPassed': '✅ Environment check passed',
    'update.checking': 'Checking…', 'update.found': '{count} new commit(s) found ({local} → {remote})',
    'toast.newVersion': 'A new version is available. Select “Update now”.', 'update.latest': 'Up to date ({head})',
    'toast.latest': '✅ Already up to date', 'update.checkFailed': 'Check failed', 'toast.updateCheckFailed': 'Unable to check for updates. See the logs.',
    'update.updating': 'Updating…', 'toast.updateRestarting': 'Update complete. Restarting Harness…',
    'toast.updateRestarted': '✅ Updated and restarted', 'toast.restartFailed': 'Restart failed. Start Harness manually.',
    'toast.updated': '✅ Update complete', 'toast.updateFailed': 'Update failed. Check the logs.',
    'toast.bindSuccess': '✅ Harness {version} bound: {path}',
    'toast.bindNonGit': 'Harness is bound and can be started, but version updates require a Git checkout',
    'toast.bindInvalid': 'The selected folder is not a valid DeepSeek Harness source checkout',
    'toast.bindNotFound': 'The folder does not exist or cannot be accessed', 'toast.bindRunning': 'Stop the current Harness before switching folders',
    'toast.bindFailed': 'Unable to bind: {reason}', 'toast.mirrorSaved': 'Download mirror saved: {mirror}',
    'toast.mirrorCleared': 'Download mirror cleared; only the official GitHub source will be used', 'toast.openingPlatform': 'Opening the API platform…',
    'toast.apiKeyRequired': '⚠ Enter an API key', 'toast.baseUrlRequired': '⚠ Enter a Base URL',
    'toast.apiSaved': '✅ API settings saved and active', 'toast.saveFailed': 'Unable to save: {reason}',
    'toast.exported': '✅ Environment migration package created', 'toast.imported': '✅ Environment migrated, bound, and dependencies installed',
    'toast.launcherExported': '✅ Launcher and portable environment packaged. Extract it and run DSH Manager.exe.',
    'toast.importedNeedsInstall': 'Environment migrated and bound, but dependencies were not installed. Check the logs.',
    'toast.migrationFailed': 'Environment migration failed: {reason}', 'toast.cleanupFailed': 'Unable to start cleanup: {reason}',
    'common.unknownReason': 'Unknown reason'
  }
};

let currentLanguage = 'zh-CN';

function t(key, vars = {}) {
  const value = I18N[currentLanguage][key] || I18N['zh-CN'][key] || key;
  return value.replace(/\{(\w+)\}/g, (_match, name) => String(vars[name] ?? ''));
}

function savedTheme() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    if (value === 'light' || value === 'dark') return value;
  } catch { /* localStorage may be unavailable in restricted environments */ }
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const els = {
  pill: $('#statusPill'), statusText: $('#statusText'),
  verText: $('#verText'), headText: $('#headText'), portText: $('#portText'), pathText: $('#pathText'),
  curVerText: $('#curVerText'), curHeadText: $('#curHeadText'), curPortText: $('#curPortText'),
  miniDot: $('#miniDot'), miniStatus: $('#miniStatus'),
  btnStart: $('#btnStart'), btnStop: $('#btnStop'),
  heroCard: $('#heroCard'), actionCard: $('#actionCard'),
  envDeployState: $('#envDeployState'), envPath: $('#envPath'), envWarn: $('#envWarn'),
  prereqGit: $('#prereqGit'), prereqNode: $('#prereqNode'), prereqPnpm: $('#prereqPnpm'),
  btnDeploy: $('#btnDeploy'), btnBindExisting: $('#btnBindExisting'), btnRedeploy: $('#btnRedeploy'), btnEnvCheck: $('#btnEnvCheck'),
  btnCheck: $('#btnCheck'), btnUpdate: $('#btnUpdate'), updateHint: $('#updateHint'),
  pathInput: $('#pathInput'), btnSavePath: $('#btnSavePath'), btnChoosePath: $('#btnChoosePath'), btnOpenDir: $('#btnOpenDir'),
  mirrorInput: $('#mirrorInput'), btnSaveMirror: $('#btnSaveMirror'),
  btnExportLauncher: $('#btnExportLauncher'), btnExportEnvironment: $('#btnExportEnvironment'), btnImportEnvironment: $('#btnImportEnvironment'),
  btnCleanUninstall: $('#btnCleanUninstall'), chkRemoveDshHome: $('#chkRemoveDshHome'), chkRemoveCheckout: $('#chkRemoveCheckout'),
  chkOpen: $('#chkOpen'), log: $('#log'), btnClear: $('#btnClear'), chkAutoScroll: $('#chkAutoScroll'),
  btnOpen: $('#btnOpen'), btnTheme: $('#btnTheme'), themeLabel: $('#themeLabel'),
  btnLanguage: $('#btnLanguage'), languageLabel: $('#languageLabel'), btnQuit: $('#btnQuit'), toast: $('#toast'),
  apiBound: $('#apiBound'), apiPathText: $('#apiPathText'), apiProvider: $('#apiProvider'),
  apiBaseUrl: $('#apiBaseUrl'), apiKey: $('#apiKey'), btnKeyToggle: $('#btnKeyToggle'),
  apiPlatformUrl: $('#apiPlatformUrl'), btnOpenPlatform: $('#btnOpenPlatform'),
  btnSaveApi: $('#btnSaveApi'), apiHint: $('#apiHint'),
  btnStatsRefresh: $('#btnStatsRefresh'), statsProgress: $('#statsProgress'),
  statsProgressText: $('#statsProgressText'), statsProgressPercent: $('#statsProgressPercent'), statsProgressFill: $('#statsProgressFill'),
  stTotalTokens: $('#stTotalTokens'), stHitRate: $('#stHitRate'), stCost: $('#stCost'), stLlmCalls: $('#stLlmCalls'),
  tokenBar: $('#tokenBar'), tokenLegend: $('#tokenLegend'),
  usageTimeline: $('#usageTimeline'), timelineRange: $('#timelineRange'), statsGrid: $('#statsGrid'),
  modelTableBody: $('#modelTableBody'), statsNote: $('#statsNote'),
  btnPluginsRefresh: $('#btnPluginsRefresh'), pluginSpec: $('#pluginSpec'),
  btnPluginInstall: $('#btnPluginInstall'), pluginList: $('#pluginList'),
  pluginCount: $('#pluginCount'), pluginNote: $('#pluginNote')
};

let busy = false;
let status = null;
let lastApiBinding = null;
let statsLoading = false;
let statsProgressDelay = null;
let statsProgressHide = null;
let lastStatsProgress = null;
let lastStatsData = null;
let timelinePeriod = 'day';

function applyLanguage(language) {
  currentLanguage = language === 'en-US' ? 'en-US' : 'zh-CN';
  document.documentElement.lang = currentLanguage;
  document.documentElement.dataset.language = currentLanguage;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  document.querySelectorAll('[data-i18n-aria-label]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel)); });
  if (lastStatsProgress) renderStatsProgress(lastStatsProgress);
  if (lastStatsData) renderStats(lastStatsData);
  els.languageLabel.textContent = t('language.label');
  els.btnLanguage.title = t('language.switch');
  els.btnLanguage.setAttribute('aria-label', t('language.switch'));
  applyTheme(document.documentElement.dataset.theme || savedTheme());
  if (status) renderStatus(status, true);
  if (lastApiBinding) renderApiBinding(lastApiBinding);
}

function applyTheme(theme, persist = false) {
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  els.btnTheme.setAttribute('aria-pressed', String(next === 'dark'));
  els.btnTheme.title = t(next === 'dark' ? 'theme.switchLight' : 'theme.switchDark');
  els.themeLabel.textContent = t(next === 'dark' ? 'theme.light' : 'theme.dark');
  if (persist) {
    try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
  }
}

applyLanguage('zh-CN');
applyTheme(savedTheme());

const STYLE = {
  running: ['status.running', 'green'],
  'running-external': ['status.runningExternal', 'green'],
  starting: ['status.starting', 'amber'],
  stopping: ['status.stopping', 'amber'],
  updating: ['status.updating', 'amber'],
  deploying: ['status.deploying', 'amber'],
  stopped: ['status.stopped', 'gray']
};

/* ---------- 菜单切换 ---------- */
function switchTab(name) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
  if (name === 'stats') loadStats();
  if (name === 'plugins') loadPlugins();
}
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

/* ---------- 状态渲染 ---------- */
function setBusy(b) {
  busy = b;
  [els.btnStart, els.btnStop, els.btnCheck, els.btnUpdate, els.btnSavePath, els.btnChoosePath, els.btnBindExisting, els.btnDeploy, els.btnRedeploy, els.btnEnvCheck, els.btnExportLauncher, els.btnExportEnvironment, els.btnImportEnvironment, els.btnCleanUninstall].forEach(x => { x.disabled = b; });
}

function renderPrereq(chipEl, ok) {
  chipEl.className = 'chip ' + (ok ? 'ok' : 'bad');
}

function renderStatus(s, silent = false) {
  const wasRunning = status && (status.state === 'running' || status.state === 'running-external');
  status = s;
  const [statusKey, cls] = STYLE[s.state] || ['status.unknown', 'gray'];
  const txt = t(statusKey);

  const d = s.deploy || {};
  const deployed = !!d.deployed;
  const envOk = d.git && d.nodeOk && d.pnpm;

  // 环境与部署面板：始终展示
  els.envDeployState.textContent = deployed
    ? t('deploy.deployed', { version: s.version || '—', head: s.head || '—' })
    : t('deploy.notDeployed');
  els.envPath.textContent = d.checkout || '—';
  els.prereqGit.textContent = 'Git ' + (d.git ? '✓' : '✗');
  els.prereqNode.textContent = 'Node.js ' + (d.node ? (d.nodeOk ? '✓' : '✗') : '✗') + (d.node ? ' ' + d.nodeVersion : '');
  els.prereqPnpm.textContent = 'pnpm ' + (d.pnpm ? '✓' : '✗');
  renderPrereq(els.prereqGit, d.git);
  renderPrereq(els.prereqNode, d.node && d.nodeOk);
  renderPrereq(els.prereqPnpm, d.pnpm);

  // 部署按钮：未部署时显示“一键下载并部署”；已部署时显示“重新部署”
  els.btnDeploy.hidden = deployed;
  els.btnBindExisting.hidden = deployed;
  els.btnRedeploy.hidden = !deployed;

  // 提示信息
  let warn = '';
  if (!deployed) {
    warn = t('deploy.warnNotDeployed');
  } else if (!envOk) {
    const missing = [];
    if (!d.git) missing.push('Git');
    if (!d.node) missing.push('Node.js');
    else if (!d.nodeOk) missing.push(t('deploy.nodeTooOld'));
    if (!d.pnpm) missing.push('pnpm');
    warn = t('deploy.warnEnv', { missing: missing.join(currentLanguage === 'zh-CN' ? '、' : ', ') });
  }
  els.envWarn.textContent = warn;
  els.envWarn.classList.toggle('hidden', !warn);
  els.envWarn.classList.toggle('warn', !!warn && deployed && !envOk);

  els.pill.className = 'pill ' + cls;
  els.statusText.textContent = txt;
  els.verText.textContent = s.version || '—';
  els.headText.textContent = s.head || '—';
  els.portText.textContent = s.port;
  els.pathText.textContent = s.checkout || '—';

  els.curVerText.textContent = s.version || '—';
  els.curHeadText.textContent = s.head || '—';
  els.curPortText.textContent = s.port;

  els.miniDot.className = 'dot ' + (cls === 'gray' ? 'gray' : cls);
  els.miniStatus.textContent = txt;

  const isRunning = s.state === 'running' || s.state === 'running-external';
  const deployedNow = !!(s.deploy || {}).deployed;
  els.btnStart.disabled = busy || isRunning || !deployedNow ||
    s.state === 'starting' || s.state === 'stopping' || s.state === 'updating' || s.state === 'deploying';
  els.btnStop.disabled = busy || (!isRunning && !s.inUse);
  if (!silent && !s.checkoutsOk && !wasRunning) toast(t('toast.checkoutMissing'), 'error');
}

/* ---------- 日志 ---------- */
function addLog(e) {
  const row = document.createElement('div');
  row.className = 'line ' + (e.level || 'info');
  const t = document.createElement('span'); t.className = 't'; t.textContent = e.time || '';
  const m = document.createElement('span'); m.className = 'm'; m.textContent = e.line || '';
  row.append(t, m);
  els.log.appendChild(row);
  while (els.log.childNodes.length > 1200) els.log.removeChild(els.log.firstChild);
  if (els.chkAutoScroll.checked) els.log.scrollTop = els.log.scrollHeight;
}

/* ---------- Toast ---------- */
let toastTimer = null;
function toast(msg, type = 'info') {
  els.toast.textContent = msg;
  els.toast.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.className = 'toast'; }, 3500);
}

const PRESETS = {
  deepseek: { baseURL: 'https://api.deepseek.com', platform: 'https://platform.deepseek.com/api_keys' },
  custom: { baseURL: '', platform: '' }
};

function renderApiBinding(a) {
  if (!a) return;
  lastApiBinding = a;
  els.apiPathText.textContent = a.dshHome || '—';
  els.apiBound.textContent = a.bound ? t('api.bound', { key: a.apiKeyMasked }) : t('api.unbound');
  els.apiBound.className = 'chip ' + (a.bound ? 'ok' : 'bad');
  if (!els.apiBaseUrl.value) els.apiBaseUrl.value = a.baseURL || '';
  if (!els.apiPlatformUrl.value) els.apiPlatformUrl.value = a.platformUrl || '';
  els.apiProvider.value = PRESETS[a.baseURL] && a.baseURL === PRESETS.deepseek.baseURL ? 'deepseek' : 'custom';
  if (a.bound && !els.apiKey.value) els.apiKey.placeholder = t('api.keyPlaceholder', { key: a.apiKeyMasked });
}

async function refresh() {
  try { renderStatus(await window.dsh.getState()); } catch (e) { /* ignore */ }
}

async function init() {
  const cfg = await window.dsh.getConfig();
  applyLanguage(cfg.language || 'zh-CN');
  els.pathInput.value = cfg.checkout;
  els.mirrorInput.value = cfg.deployMirrorUrl || '';
  els.chkOpen.checked = cfg.openAfterStart !== false;
  (await window.dsh.getLogs()).forEach(addLog);
  window.dsh.on('log', addLog);
  window.dsh.on('state', refresh);
  window.dsh.on('stats-progress', renderStatsProgress);
  await refresh();
  setInterval(refresh, 3000);
  renderApiBinding(await window.dsh.getApiBinding());
}

/* ---------- Token 统计 ---------- */
const fmtNum = n => (Number(n) || 0).toLocaleString(currentLanguage);
const fmtCompact = n => {
  n = Number(n) || 0;
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
};
const fmtUsd = n => '$' + (Number(n) || 0).toFixed(4);

const BAR_COLORS = [
  ['input', '#4176e6', 'stats.inputUncached'],
  ['cacheRead', '#22c55e', 'stats.cacheHit'],
  ['cacheWrite', '#f59e0b', 'stats.cacheWritten'],
  ['output', '#8b5cf6', 'stats.output'],
  ['reasoning', '#ec4899', 'stats.reasoning']
];

function statsProgressLabel(progress) {
  if (progress.phase === 'processing') return t('stats.progressProcessing', progress);
  if (progress.phase === 'saving') return t('stats.progressSaving');
  if (progress.phase === 'done') return t('stats.progressDone');
  return t('stats.progressScanning');
}

function renderStatsProgress(progress = {}) {
  lastStatsProgress = progress;
  const percent = Math.max(0, Math.min(100, Math.round(Number(progress.percent) || 0)));
  els.statsProgressText.textContent = statsProgressLabel(progress);
  els.statsProgressPercent.textContent = `${percent}%`;
  els.statsProgressFill.style.width = `${percent}%`;
  els.statsProgress.setAttribute('aria-valuenow', String(percent));
}

function beginStatsProgress() {
  clearTimeout(statsProgressDelay);
  clearTimeout(statsProgressHide);
  els.statsProgress.hidden = true;
  renderStatsProgress({ phase: 'scanning', percent: 0, processed: 0, total: 0 });
  statsProgressDelay = setTimeout(() => { els.statsProgress.hidden = false; }, 120);
}

function finishStatsProgress(ok) {
  clearTimeout(statsProgressDelay);
  if (!ok) {
    els.statsProgress.hidden = true;
    return;
  }
  renderStatsProgress({ ...(lastStatsProgress || {}), phase: 'done', percent: 100 });
  if (!els.statsProgress.hidden) statsProgressHide = setTimeout(() => { els.statsProgress.hidden = true; }, 500);
}

function timelineKey(date, period) {
  const pad = value => String(value).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  if (period === 'month') return day.slice(0, 7);
  if (period === 'hour') return `${day}T${pad(date.getHours())}`;
  return day;
}

function timelineLabel(date, period, full = false) {
  if (period === 'month') {
    return date.toLocaleDateString(currentLanguage, full
      ? { year: 'numeric', month: 'long' }
      : { year: '2-digit', month: 'short' });
  }
  if (period === 'hour') {
    return date.toLocaleString(currentLanguage, full
      ? { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { month: 'numeric', day: 'numeric', hour: '2-digit' });
  }
  return date.toLocaleDateString(currentLanguage, full
    ? { year: 'numeric', month: 'long', day: 'numeric' }
    : { month: 'short', day: 'numeric' });
}

function timelineBuckets(timeline, period) {
  const source = timeline.map(point => ({ ...point, timestamp: new Date(`${point.time}:00`).getTime() }))
    .filter(point => Number.isFinite(point.timestamp));
  if (!source.length) return [];
  const count = period === 'month' ? 12 : period === 'hour' ? 24 : 30;
  const end = new Date(Math.max(...source.map(point => point.timestamp)));
  if (period === 'month') end.setMonth(end.getMonth(), 1);
  else if (period === 'day') end.setHours(0, 0, 0, 0);
  else end.setMinutes(0, 0, 0);

  const buckets = [];
  for (let offset = count - 1; offset >= 0; offset--) {
    const date = new Date(end);
    if (period === 'month') date.setMonth(date.getMonth() - offset);
    else if (period === 'day') date.setDate(date.getDate() - offset);
    else date.setHours(date.getHours() - offset);
    buckets.push({ key: timelineKey(date, period), date, calls: 0, totalTokens: 0 });
  }
  const byKey = new Map(buckets.map(bucket => [bucket.key, bucket]));
  for (const point of source) {
    const bucket = byKey.get(timelineKey(new Date(point.timestamp), period));
    if (!bucket) continue;
    bucket.calls += Number(point.calls) || 0;
    bucket.totalTokens += Number(point.totalTokens) || 0;
  }
  return buckets;
}

function renderUsageTimeline(timeline = []) {
  const points = timelineBuckets(timeline, timelinePeriod);
  document.querySelectorAll('[data-timeline-period]').forEach(button => {
    const active = button.dataset.timelinePeriod === timelinePeriod;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  els.timelineRange.textContent = t(`stats.range${timelinePeriod[0].toUpperCase()}${timelinePeriod.slice(1)}`);
  if (!points.length) {
    els.usageTimeline.innerHTML = `<div class="timeline-empty">${t('stats.timelineEmpty')}</div>`;
    return;
  }

  const width = 900;
  const height = 226;
  const plot = { left: 58, right: 18, top: 16, bottom: 34 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const maxTokens = Math.max(1, ...points.map(point => Number(point.totalTokens) || 0));
  const y = value => plot.top + plotHeight - (Number(value) || 0) / maxTokens * plotHeight;
  const grid = [0, 0.25, 0.5, 0.75, 1].map(ratio => {
    const gridY = plot.top + plotHeight * (1 - ratio);
    return `<line class="timeline-grid" x1="${plot.left}" y1="${gridY}" x2="${width - plot.right}" y2="${gridY}"></line>` +
      `<text class="timeline-axis-label" x="${plot.left - 9}" y="${gridY + 3}" text-anchor="end">${fmtCompact(maxTokens * ratio)}</text>`;
  }).join('');
  const labelCount = Math.min(6, points.length);
  const labelIndexes = [...new Set(Array.from({ length: labelCount }, (_, index) =>
    labelCount === 1 ? 0 : Math.round(index * (points.length - 1) / (labelCount - 1))))];
  const dateLabels = labelIndexes.map(index => {
    const slotWidth = plotWidth / points.length;
    const label = timelineLabel(points[index].date, timelinePeriod);
    return `<text class="timeline-axis-label" x="${plot.left + slotWidth * (index + 0.5)}" y="${height - 10}" text-anchor="middle">${escapeHtml(label)}</text>`;
  }).join('');
  const slotWidth = plotWidth / points.length;
  const barWidth = Math.max(5, Math.min(30, slotWidth * 0.64));
  const bars = points.map((point, index) => {
    const barY = y(point.totalTokens);
    const barHeight = point.totalTokens > 0 ? Math.max(2, plot.top + plotHeight - barY) : 0;
    const barX = plot.left + slotWidth * index + (slotWidth - barWidth) / 2;
    const title = `${timelineLabel(point.date, timelinePeriod, true)} · ${fmtNum(point.totalTokens)} ${t('stats.timelineTokens')} · ${fmtNum(point.calls)} ${t('stats.timelineCalls')}`;
    return `<rect class="timeline-bar" x="${barX.toFixed(2)}" y="${(plot.top + plotHeight - barHeight).toFixed(2)}" width="${barWidth.toFixed(2)}" height="${barHeight.toFixed(2)}" rx="3"><title>${escapeHtml(title)}</title></rect>`;
  }).join('');

  const periodLabel = t(`stats.period${timelinePeriod[0].toUpperCase()}${timelinePeriod.slice(1)}`);
  els.usageTimeline.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(t('stats.timelineAria', { period: periodLabel }))}">` +
    `${grid}${bars}${dateLabels}</svg>`;
}

function renderStats(s) {
  const tokens = s.tokens || {};
  els.stTotalTokens.textContent = fmtCompact(s.totalTokens);
  els.stHitRate.textContent = ((Number(s.hitRate) || 0) * 100).toFixed(1) + '%';
  els.stCost.textContent = fmtUsd(s.cost);
  els.stLlmCalls.textContent = fmtNum(s.llmCalls);

  const parts = BAR_COLORS.map(([key, color, labelKey]) => ({ key, color, label: t(labelKey), v: tokens[key] || 0 }))
    .filter(part => part.v > 0);
  const total = parts.reduce((sum, part) => sum + part.v, 0) || 1;
  els.tokenBar.innerHTML = parts.map(part =>
    `<span class="bar-seg" style="width:${(part.v / total * 100).toFixed(2)}%;background:${part.color}" title="${escapeHtml(part.label)}: ${fmtNum(part.v)}"></span>`).join('');
  els.tokenLegend.innerHTML = parts.map(part =>
    `<span class="lg"><i style="background:${part.color}"></i>${escapeHtml(part.label)} <b>${fmtCompact(part.v)}</b> (${(part.v / total * 100).toFixed(1)}%)</span>`).join('');

  renderUsageTimeline(s.timeline || []);
  const rows = [
    [t('stats.sessions'), fmtNum(s.sessions)], [t('stats.turns'), fmtNum(s.turns)], [t('stats.steps'), fmtNum(s.steps)],
    [t('stats.userMessages'), fmtNum(s.userMessages)], [t('stats.toolCalls'), fmtNum(s.toolCalls)], [t('stats.llmCalls'), fmtNum(s.llmCalls)]
  ];
  els.statsGrid.innerHTML = rows.map(([label, value]) =>
    `<div class="sg-item"><span>${escapeHtml(label)}</span><b>${value}</b></div>`).join('');

  els.modelTableBody.innerHTML = (s.models || []).map(model =>
    `<tr><td>${escapeHtml(model.model)}</td><td>${fmtNum(model.calls)}</td><td>${fmtCompact(model.tokens.input)}</td>` +
    `<td>${fmtCompact(model.tokens.cacheRead)}</td><td>${fmtCompact(model.tokens.cacheWrite)}</td>` +
    `<td>${fmtCompact(model.tokens.output + model.tokens.reasoning)}</td><td><b>${fmtCompact(model.totalTokens)}</b></td>` +
    `<td>${fmtUsd(model.cost)}</td></tr>`).join('') ||
    `<tr><td colspan="8" class="dim-cell">${t('stats.noData')}</td></tr>`;

  els.statsNote.textContent = t('stats.dataNote', {
    root: s.sessionsRoot,
    time: new Date(s.updatedAt).toLocaleTimeString(currentLanguage, { hour12: false })
  });
}

async function loadStats(force) {
  if (statsLoading) return;
  statsLoading = true;
  els.btnStatsRefresh.disabled = true;
  beginStatsProgress();
  let succeeded = false;
  try {
    els.statsNote.textContent = t('stats.calculating');
    const s = await window.dsh.getStats({ force: !!force });
    if (!s || !s.ok) { els.statsNote.textContent = t('stats.readFailed', { error: s && s.error || '' }); return; }
    lastStatsData = s;
    renderStats(s);
    succeeded = true;
  } catch (e) {
    els.statsNote.textContent = t('stats.readFailed', { error: String(e) });
  } finally {
    statsLoading = false;
    els.btnStatsRefresh.disabled = false;
    finishStatsProgress(succeeded);
  }
}

els.btnStatsRefresh.addEventListener('click', () => loadStats(true));
document.querySelectorAll('[data-timeline-period]').forEach(button => {
  button.addEventListener('click', () => {
    const next = button.dataset.timelinePeriod;
    if (!['month', 'day', 'hour'].includes(next) || next === timelinePeriod) return;
    timelinePeriod = next;
    renderUsageTimeline(lastStatsData && lastStatsData.timeline || []);
  });
});
setInterval(() => {
  const active = document.querySelector('.tab-panel.active');
  if (active && active.id === 'tab-stats') loadStats();
}, 60000);

/* ---------- 插件管理 ---------- */
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

async function loadPlugins() {
  try {
    els.pluginNote.textContent = t('plugins.loading');
    const r = await window.dsh.getPlugins();
    if (!r || !r.ok) { els.pluginNote.textContent = t('plugins.readFailed'); return; }
    if (!r.initialized) {
      els.pluginList.innerHTML = `<div class="dim-cell" style="padding:12px">${t('plugins.uninitialized')}</div>`;
      els.pluginCount.textContent = '0';
      els.pluginNote.textContent = t('plugins.profile', { profile: r.profile, dir: r.profileDir });
      return;
    }
    const plugins = r.plugins || [];
    els.pluginCount.textContent = String(plugins.length);
    els.pluginList.innerHTML = plugins.map(p => `
      <div class="plugin-item">
        <div class="plugin-main">
          <div class="plugin-name">${escapeHtml(p.name)} ${p.bundle ? `<span class="badge">${t('plugins.enabled')}</span>` : `<span class="badge dim-badge">${t('plugins.dependency')}</span>`}${!p.isDependency ? `<span class="badge blue-badge">${t('plugins.builtIn')}</span>` : ''}</div>
          <div class="plugin-desc">${escapeHtml(p.description || (p.version ? 'v' + p.version : '—'))}</div>
        </div>
        <div class="plugin-side">
          ${p.version ? '<span class="plugin-ver">v' + escapeHtml(p.version) + '</span>' : ''}
          ${p.isDependency ? `<button class="btn small danger ghost" data-uninstall="${escapeHtml(p.name)}">${t('plugins.uninstall')}</button>` : ''}
        </div>
      </div>`).join('') ||
      `<div class="dim-cell" style="padding:12px">${t('plugins.empty')}</div>`;
    els.pluginNote.textContent = t('plugins.profileNote', { profile: r.profile, dir: r.profileDir });
  } catch (e) {
    els.pluginNote.textContent = t('plugins.listFailed', { error: String(e) });
  }
}

els.btnPluginsRefresh.addEventListener('click', () => loadPlugins());

els.btnPluginInstall.addEventListener('click', async () => {
  const spec = els.pluginSpec.value.trim();
  if (!spec) { toast(t('toast.pluginSpecRequired'), 'error'); return; }
  if (!confirm(t('confirm.pluginInstall', { spec }))) return;
  setBusy(true);
  addLog({ time: now(), level: 'info', line: t('log.installPlugin', { spec }) });
  const r = await window.dsh.pluginInstall(spec);
  setBusy(false);
  if (r.ok) {
    toast(t('toast.pluginInstalled'));
    els.pluginSpec.value = '';
    loadPlugins();
  } else if (r.reason === 'checkout-not-found') toast(t('toast.pluginNotDeployed'), 'error');
  else toast(t('toast.pluginInstallFailed'), 'error');
});

els.pluginList.addEventListener('click', async e => {
  const btn = e.target.closest('[data-uninstall]');
  if (!btn) return;
  const name = btn.dataset.uninstall;
  if (!confirm(t('confirm.pluginUninstall', { name }))) return;
  setBusy(true);
  addLog({ time: now(), level: 'info', line: t('log.uninstallPlugin', { name }) });
  const r = await window.dsh.pluginUninstall(name);
  setBusy(false);
  if (r.ok) {
    toast(t('toast.pluginUninstalled'));
    loadPlugins();
  } else if (r.reason === 'checkout-not-found') toast(t('toast.pluginNotDeployed'), 'error');
  else toast(t('toast.pluginUninstallFailed'), 'error');
});

els.pluginSpec.addEventListener('keydown', e => { if (e.key === 'Enter') els.btnPluginInstall.click(); });

/* ---------- 事件绑定 ---------- */
els.btnStart.addEventListener('click', async () => {
  setBusy(true);
  addLog({ time: now(), level: 'info', line: t('log.start') });
  const r = await window.dsh.start();
  setBusy(false);
  if (r.ok) {
    if (r.already) toast(t('toast.alreadyRunning'));
    else if (els.chkOpen.checked) { toast(t('toast.startOpened')); setTimeout(() => window.dsh.open(), 1500); }
    else toast(t('toast.startSuccess'));
  } else if (r.reason === 'checkout-not-found') toast(t('toast.checkoutMissing'), 'error');
  else if (r.reason === 'missing-env') toast(t('toast.missingEnv'), 'error');
  else toast(t('toast.startFailed'), 'error');
  await refresh();
});

els.btnStop.addEventListener('click', async () => {
  const ext = status && status.state === 'running-external';
  if (ext && !confirm(t('confirm.stopExternal'))) return;
  setBusy(true);
  addLog({ time: now(), level: 'info', line: t('log.stop') });
  await window.dsh.stop();
  setBusy(false);
  toast(t('toast.stopped'));
  await refresh();
});

async function runDeploy(force) {
  const d = (status && status.deploy) || {};
  const missing = !d.git ? 'Git' : (!d.node ? 'Node.js' : (!d.pnpm ? 'pnpm' : null));
  if (missing) {
    const urls = {
      Git: 'https://git-scm.com/download/win',
      'Node.js': 'https://nodejs.org/zh-cn/download',
      pnpm: 'https://pnpm.io/zh-CN/installation'
    };
    toast(t('toast.missingTool', { tool: missing }), 'warn');
    window.dsh.openUrl(urls[missing]);
    return;
  }
  setBusy(true);
  addLog({ time: now(), level: 'info', line: t('log.action', { action: t(force ? 'deploy.redeploy' : 'deploy.download') }) });
  const r = await window.dsh.deploy({ force });
  setBusy(false);
  if (r.ok) {
    toast(t('toast.deployStarting'));
    const s2 = await window.dsh.start();
    if (s2.ok) {
      if (els.chkOpen.checked) { toast(t('toast.deployOpen')); setTimeout(() => window.dsh.open(), 1500); }
      else toast(t('toast.deploySuccess'));
    } else {
      toast(t('toast.deployStartFailed'), 'error');
    }
  } else if (r.reason === 'dir-not-empty') toast(t('toast.dirNotEmpty'), 'error');
  else if (r.reason === 'clone-failed') toast(t('toast.cloneFailed'), 'error');
  else if (r.reason === 'install-failed') toast(t('toast.dependenciesFailed'), 'error');
  else if (r.reason === 'already-deployed') toast(t('toast.harnessExists'));
  else toast(t('toast.deployFailed', { reason: r.reason || t('common.unknownReason') }), 'error');
  await refresh();
}

els.btnDeploy.addEventListener('click', () => runDeploy(false));

els.btnRedeploy.addEventListener('click', async () => {
  if (!confirm(t('confirm.redeploy'))) return;
  await runDeploy(true);
});

els.btnEnvCheck.addEventListener('click', async () => {
  setBusy(true);
  const d = await window.dsh.checkDeploy();
  setBusy(false);
  if (!d) { toast(t('toast.envCheckFailed'), 'error'); return; }
  const missing = [];
  if (!d.git) missing.push('Git');
  if (!d.node) missing.push('Node.js');
  else if (!d.nodeOk) missing.push(t('toast.nodeTooOld'));
  if (!d.pnpm) missing.push('pnpm');
  if (!d.deployed) missing.push(t('toast.harnessNotDeployed'));
  toast(missing.length ? t('toast.envIssues', { missing: missing.join(currentLanguage === 'zh-CN' ? '、' : ', ') }) : t('toast.envPassed'), missing.length ? 'warn' : 'info');
  await refresh();
});

els.btnCheck.addEventListener('click', async () => {
  setBusy(true);
  els.updateHint.textContent = t('update.checking');
  const r = await window.dsh.checkUpdate();
  setBusy(false);
  if (r.ok) {
    if (r.behind > 0) {
      els.updateHint.textContent = t('update.found', { count: r.behind, local: r.localHead, remote: r.remoteHead });
      els.btnUpdate.disabled = false;
      toast(t('toast.newVersion'));
    } else {
      els.updateHint.textContent = t('update.latest', { head: r.localHead });
      els.btnUpdate.disabled = true;
      toast(t('toast.latest'));
    }
  } else {
    els.updateHint.textContent = t('update.checkFailed');
    toast(t('toast.updateCheckFailed'), 'error');
  }
});

els.btnUpdate.addEventListener('click', async () => {
  const wasRunning = status && (status.state === 'running' || status.state === 'running-external');
  setBusy(true);
  els.updateHint.textContent = t('update.updating');
  const r = await window.dsh.runUpdate();
  setBusy(false);
  els.updateHint.textContent = '—';
  els.btnUpdate.disabled = true;
  if (r.ok) {
    if (wasRunning) {
      toast(t('toast.updateRestarting'));
      await window.dsh.stop();
      const s2 = await window.dsh.start();
      if (s2.ok) toast(t('toast.updateRestarted')); else toast(t('toast.restartFailed'), 'error');
    } else {
      toast(t('toast.updated'));
    }
  } else {
    toast(t('toast.updateFailed'), 'error');
  }
  await refresh();
});

async function finishCheckoutBinding(result) {
  if (!result || result.canceled) return;
  if (result.ok) {
    els.pathInput.value = result.path;
    toast(t(result.gitOk ? 'toast.bindSuccess' : 'toast.bindNonGit', { version: result.version || '—', path: result.path }));
  } else if (['not-harness', 'package-invalid', 'not-directory'].includes(result.reason)) {
    toast(t('toast.bindInvalid'), 'error');
  } else if (['path-empty', 'path-not-found'].includes(result.reason)) {
    toast(t('toast.bindNotFound'), 'error');
  } else if (result.reason === 'service-running') {
    toast(t('toast.bindRunning'), 'warn');
  } else {
    toast(t('toast.bindFailed', { reason: result.reason || t('common.unknownReason') }), 'error');
  }
  await refresh();
}

async function chooseAndBindCheckout() {
  setBusy(true);
  let result;
  try { result = await window.dsh.chooseCheckout(); }
  finally { setBusy(false); }
  await finishCheckoutBinding(result);
}

els.btnSavePath.addEventListener('click', async () => {
  const p = els.pathInput.value.trim();
  if (!p) { toast(t('toast.bindNotFound'), 'error'); return; }
  setBusy(true);
  let result;
  try { result = await window.dsh.bindCheckout(p); }
  finally { setBusy(false); }
  await finishCheckoutBinding(result);
});
els.btnChoosePath.addEventListener('click', chooseAndBindCheckout);
els.btnBindExisting.addEventListener('click', chooseAndBindCheckout);

els.btnSaveMirror.addEventListener('click', async () => {
  const m = els.mirrorInput.value.trim();
  await window.dsh.setConfig({ deployMirrorUrl: m });
  toast(m ? t('toast.mirrorSaved', { mirror: m }) : t('toast.mirrorCleared'));
});

els.btnOpenDir.addEventListener('click', () => window.dsh.openCheckout());
els.btnOpen.addEventListener('click', () => window.dsh.open());
els.btnTheme.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true);
});
els.btnLanguage.addEventListener('click', async () => {
  const next = currentLanguage === 'zh-CN' ? 'en-US' : 'zh-CN';
  applyLanguage(next);
  await window.dsh.setConfig({ language: next });
  const active = document.querySelector('.tab-panel.active');
  if (active && active.id === 'tab-stats' && !lastStatsData) loadStats();
  if (active && active.id === 'tab-plugins') loadPlugins();
});
els.btnQuit.addEventListener('click', () => window.dsh.quit());
els.btnClear.addEventListener('click', () => { els.log.innerHTML = ''; });
els.pathInput.addEventListener('keydown', e => { if (e.key === 'Enter') els.btnSavePath.click(); });
els.chkOpen.addEventListener('change', () => window.dsh.setConfig({ openAfterStart: els.chkOpen.checked }));

/* ---------- 环境迁移与卸载 ---------- */
els.btnExportLauncher.addEventListener('click', async () => {
  setBusy(true);
  let result;
  try { result = await window.dsh.exportLauncherEnvironment(); }
  catch (error) { result = { ok: false, reason: String(error) }; }
  finally { setBusy(false); }
  if (!result || result.canceled) return;
  if (result.ok) toast(t('toast.launcherExported'));
  else toast(t('toast.migrationFailed', { reason: result.reason || t('common.unknownReason') }), 'error');
});

els.btnExportEnvironment.addEventListener('click', async () => {
  setBusy(true);
  let result;
  try { result = await window.dsh.exportEnvironment(); }
  catch (error) { result = { ok: false, reason: String(error) }; }
  finally { setBusy(false); }
  if (!result || result.canceled) return;
  if (result.ok) toast(t('toast.exported'));
  else toast(t('toast.migrationFailed', { reason: result.reason || t('common.unknownReason') }), 'error');
});

els.btnImportEnvironment.addEventListener('click', async () => {
  setBusy(true);
  let result;
  try { result = await window.dsh.importEnvironment(); }
  catch (error) { result = { ok: false, reason: String(error) }; }
  finally { setBusy(false); }
  if (!result || result.canceled) return;
  if (result.ok) {
    const cfg = await window.dsh.getConfig();
    els.pathInput.value = cfg.checkout || '';
    els.mirrorInput.value = cfg.deployMirrorUrl || '';
    renderApiBinding(await window.dsh.getApiBinding());
    toast(t(result.dependenciesInstalled ? 'toast.imported' : 'toast.importedNeedsInstall'), result.dependenciesInstalled ? 'info' : 'warn');
    await refresh();
  } else toast(t('toast.migrationFailed', { reason: result.reason || t('common.unknownReason') }), 'error');
});

els.btnCleanUninstall.addEventListener('click', async () => {
  if (!confirm(t('confirm.cleanUninstall'))) return;
  setBusy(true);
  let result;
  try {
    result = await window.dsh.cleanUninstall({
      removeDshHome: els.chkRemoveDshHome.checked,
      removeCheckout: els.chkRemoveCheckout.checked
    });
  } catch (error) { result = { ok: false, reason: String(error) }; }
  if (!result || result.canceled) { setBusy(false); return; }
  if (!result.ok) {
    setBusy(false);
    toast(t('toast.cleanupFailed', { reason: result.reason || t('common.unknownReason') }), 'error');
  }
});

/* ---------- API 绑定 ---------- */
els.apiProvider.addEventListener('change', () => {
  const p = PRESETS[els.apiProvider.value];
  if (p) {
    els.apiBaseUrl.value = p.baseURL;
    if (p.platform) els.apiPlatformUrl.value = p.platform;
  }
});

els.btnKeyToggle.addEventListener('click', () => {
  els.apiKey.type = els.apiKey.type === 'password' ? 'text' : 'password';
});

els.btnOpenPlatform.addEventListener('click', () => {
  const url = els.apiPlatformUrl.value.trim() || 'https://platform.deepseek.com/api_keys';
  window.dsh.openUrl(url);
  toast(t('toast.openingPlatform'));
});

els.btnSaveApi.addEventListener('click', async () => {
  const baseURL = els.apiBaseUrl.value.trim();
  const apiKey = els.apiKey.value.trim();
  const platformUrl = els.apiPlatformUrl.value.trim();
  if (!apiKey) { toast(t('toast.apiKeyRequired'), 'error'); return; }
  if (!baseURL) { toast(t('toast.baseUrlRequired'), 'error'); return; }
  setBusy(true);
  let r;
  try {
    r = await window.dsh.saveApiBinding({ baseURL, apiKey, platformUrl });
  } finally {
    els.apiKey.value = '';
    els.apiKey.type = 'password';
    setBusy(false);
  }
  if (r.ok) {
    toast(t('toast.apiSaved'));
    renderApiBinding(r);
  } else {
    toast(t('toast.saveFailed', { reason: r.reason || t('common.unknownReason') }), 'error');
  }
});

init();
