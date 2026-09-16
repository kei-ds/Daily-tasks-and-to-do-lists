# 每日及代办

一个常驻桌面的待办小组件。无边框、始终置顶、可拖动缩放、面板半透明、可最小化到系统托盘。

**下载安装**：[Releases 页面](https://github.com/kei-ds/Daily-tasks-and-to-do-lists/releases/latest) → 下载 `DailyWidget-Setup-1.0.0.exe` → 双击运行。目标机器不需要 Node.js。详见[安装](#安装)一节。

```
┌──────────────────────────────────────────────────┐
│ 每日及代办                      透明度 ▬●───  ─  │
├────────────────────┬─────────────────────────────┤
│ 每日事项  凌晨4:00重置│ 代办        完成后10分钟消失 │
│ ☐ 刷牙             │ ☑ 交周报            9:41     │
│ ☑ 吃药             │ ☐ 取快递                    │
│                    │                             │
│ [添加每日事项…]  + │ [添加代办…]             +   │
└────────────────────┴─────────────────────────────┘
```

## 功能

**每日事项（左栏）**
- 添加、删除、双击文字编辑、勾选完成
- 勾选后**不消失**，只显示划线
- 每天**凌晨 4:00** 自动把全部条目重置为未完成

**代办（右栏）**
- 添加、删除、双击文字编辑、勾选完成
- 勾选后显示剩余倒计时，**10 分钟后自动消失**
- 10 分钟内反勾选会取消倒计时，条目正常保留

**窗口**
- 无边框、始终置顶，不会压住其它程序的对话框
- 拖动标题栏或面板空白处移动窗口
- 拖 8 个边角调整大小（窗口没有原生缩放边框，见下方「设计取舍」）
- 右上角滑块调整面板透明度（10%–100%），文字始终清晰
- 右上角 `–` 隐藏到托盘，点托盘图标或右键菜单恢复
- 自动记住位置和大小，下次启动恢复；副屏拔掉后不会跑到屏幕外

**关机补算**
程序没运行（关机、休眠）期间错过的重置点和过期点，下次启动会一次性补上。关机 5 天再开机和关机 1 天的效果一样。

## 安装

### 直接下载安装包

去 [Releases](https://github.com/kei-ds/Daily-tasks-and-to-do-lists/releases/latest) 页面下载 `DailyWidget-Setup-1.0.0.exe`，双击运行。

> 从源码 `npm run installer` 构建出来的文件叫 `每日及代办-安装程序-1.0.0.exe`，内容和 Release 里那个完全一样，只是文件名不同——发布到 Release 时特意用了 ASCII 名，因为 GitHub 会把附件名里的中文剥掉，而且部分浏览器下载中文文件名会乱码。

目标机器**不需要** Node.js 或任何依赖，支持 Windows 10 / 11 x64。

安装向导的流程：

1. 选择「仅为当前用户安装」还是「为所有用户安装」
2. 选择安装目录
3. **选择是否开机自动启动**（默认勾选）
4. 安装

选默认的「仅为当前用户安装」时**不需要管理员权限**，装到 `%LOCALAPPDATA%\Programs\DailyWidget`。装完会创建开始菜单和桌面快捷方式，并在「设置 → 应用」里注册，可以从那里卸载。

卸载时会一并清理启动文件夹里的自启动快捷方式和注册表记录。

安装包约 105MB，只保留了中英文语言包。里面是完整的 Electron 运行时，所以体积下不去。

> **关于 Windows SmartScreen**：安装包没有代码签名（签名证书要按年付费），首次运行 Windows 可能弹出「已保护你的电脑」。点「更多信息」→「仍要运行」即可。这是所有未签名程序的正常现象。

### 从源码构建安装包

需要 **Node.js 22.12 或以上**（Electron 44 的要求），以及能访问 npm registry 和 GitHub 的网络。

```bash
git clone https://github.com/kei-ds/Daily-tasks-and-to-do-lists.git
cd Daily-tasks-and-to-do-lists
npm install
npm run installer
```

产物在 `release\每日及代办-安装程序-1.0.0.exe`。

`npm install` 会下载 Electron 运行时（约 100MB）。国内网络如果卡住，项目里的 `.npmrc` 已经配好了 npmmirror 镜像兜底。若仍然失败，删掉 `%LOCALAPPDATA%\electron\Cache`（可能残留损坏的压缩包）再重试。

只想本机跑起来调试的话，用 `npm start` 即可，不用打包。

## 使用

开机自启动的快捷方式在启动文件夹里：

```
%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\每日及代办.lnk
```

**开关自启动**：右键托盘图标 → 勾选/取消「开机自启动」。
也可以直接用命令行：

```bash
node scripts/autostart-cli.js status    # 查看当前状态
node scripts/autostart-cli.js enable    # 启用
node scripts/autostart-cli.js disable   # 禁用
```

自启动状态以启动文件夹里的 `.lnk` 是否存在为准。你手动把它删了，托盘里的勾选框下次启动会自动取消。

**装完之后想改自启动选项**，不用卸载重装——直接用托盘菜单里的勾选框即可。

## 数据

```
%APPDATA%\daily-widget\data.json
```

托盘右键菜单 →「打开数据文件夹」可以直接定位。

存了事项列表、窗口位置尺寸、透明度、自启动开关。写入用「先写 `.tmp` 再改名」的原子方式，并且有 300ms 去抖。文件损坏时会自动备份成 `data.json.bak` 并重建，不会导致程序起不来。

想重置就直接删掉这个文件。

## 开发

```bash
npm install          # 首次
npm start            # 开发模式运行
npm run package      # 打包成 release\win-unpacked\DailyWidget.exe（本机自启动就指向它）
npm run installer    # 生成安装包 release\每日及代办-安装程序-1.0.0.exe（分发用）
npm run icon         # 只重新生成 build\icon.ico
```

> **改完源码必须重新打包。**
> 本机自启动快捷方式指向 `release\win-unpacked\`，不是源码。只改 `src/` 或 `renderer/` 而不重新打包的话，开机拉起来的还是旧版本。

打包走的是 `scripts/build.js` 而不是直接调 electron-builder，原因见下方「为什么需要自定义构建脚本」。

### 为什么 `release/` 不在仓库里

它被 `.gitignore` 排除了，这是有意的：

- **它是构建产物不是源码**。里面 320MB 是 Electron 运行时（`electron.exe` 单文件 235MB、`dxcompiler.dll` 25MB……），加上 100MB 安装包，全都可以从源码一条命令重新生成。
- **Git 存二进制的代价极高**。Git 对文本能做增量压缩，但对已经压缩过的 exe 几乎无效——每次重新打包都会完整存一份新的 100MB 副本，提交几次仓库就上 GB，克隆会慢到不可用。
- **仓库和发布包是两套机制**。源码走 Git 仓库，二进制走 [Releases](https://github.com/kei-ds/Daily-tasks-and-to-do-lists/releases)，后者单独存储，不会拖慢克隆。

所以你 clone 下来只有 25 个源码文件。要安装包就去 Releases 页下载，或者本地 `npm run installer` 自己构建。

## 目录结构

```
├─ src\
│  ├─ main.js          入口：单实例锁、生命周期、IPC 注册、1 秒 tick
│  ├─ logic.js         纯函数：逻辑日、每日重置、过期清扫（不碰 IO，可单独测试）
│  ├─ store.js         data.json 的读取/原子写/去抖/损坏容错
│  ├─ window.js        BrowserWindow 创建、位置尺寸恢复与持久化、缩放手柄 IPC
│  ├─ tray.js          托盘图标和右键菜单
│  ├─ trayIcon.js      用 zlib 纯代码生成 PNG 图标，不依赖二进制资源文件
│  ├─ autostart.js     PowerShell 创建/删除启动文件夹快捷方式
│  └─ preload.js       contextBridge 暴露 window.api
├─ renderer\
│  ├─ index.html       两栏骨架 + 8 个缩放手柄
│  ├─ style.css        drag/no-drag 分区、CSS 变量控制透明度
│  └─ app.js           渲染、双击编辑、倒计时、调用 API
├─ build\
│  ├─ installer.nsh    NSIS 自定义脚本：安装界面上的自启动勾选框（**必须存成 UTF-8 with BOM**）
│  └─ icon.ico         由 scripts\make-icon.js 生成
└─ scripts\
   ├─ build.js         electron-builder 的包装脚本（见下）
   ├─ afterpack.js     打包后自己给 exe 写图标和版本信息
   ├─ make-icon.js     生成 build\icon.ico
   ├─ autostart-cli.js 命令行开关自启动
   ├─ selftest.js      自动化自检（见下）
   ├─ live-tick-test.sh      验证运行中的定时逻辑
   └─ installer-pref-test.sh 验证安装器偏好到首次启动建快捷方式的链路
```

主进程是**唯一数据源**。所有增删改走 IPC → 主进程改内存 → 落盘 → 广播全量状态 → 渲染进程重绘。这样「4:00 重置」「10 分钟清扫」「用户手动勾选」三者之间不存在竞态。渲染进程里的每秒 tick 只负责刷新倒计时文本，不做删除决策。

## 测试

```bash
npm start -- --selftest                          # 开发模式自检
dist\DailyWidget-win32-x64\DailyWidget.exe --selftest   # 打包版自检
```

自检覆盖 17 项，跑完打印 PASS/FAIL 汇总，并把窗口截图存到 `%TEMP%\daily-widget-selftest.png`。

其中**缩放是端到端验证的**：脚本用 PowerShell 真的移动系统光标到窗口边角，发出真实的 `pointerdown`，再移动光标，检查窗口尺寸增量是否是预期的 90×60。所以这个测试运行期间你的鼠标会被短暂接管。

自检**无法覆盖**的一项：`-webkit-app-region` 的命中测试由操作系统完成，合成事件绕不过去。所以「拖动标题栏能不能移动窗口」只能人工确认。

验证定时逻辑：

```bash
bash scripts/live-tick-test.sh
```

它会临时把重置点挪到几十秒之后、把一条代办的完成时间设成十几秒后过期，然后启动程序观察，跑完自动把 `src/logic.js` 还原。

验证「安装界面勾选框 → 注册表 → 首次启动建快捷方式」这条链路：

```bash
bash scripts/installer-pref-test.sh
```

它模拟安装器写下的注册表值（勾选 / 没勾 / 全新机器三种情况），跑打包好的程序，检查快捷方式和 `settings.autostart` 是否符合预期。

## 为什么需要自定义构建脚本

`npm run package` / `npm run installer` 都走 `scripts/build.js`，而不是直接调 electron-builder。原因是：

electron-builder 在写 exe 的图标和版本信息时，会让 app-builder 内部去下载 `winCodeSign` 工具包。那个包的 `darwin/` 和 `linux/` 目录下有符号链接，而在**没开「开发者模式」、也不是管理员**的 Windows 上，创建符号链接需要特权，7za 解压会直接失败：

```
ERROR: Cannot create symbolic link : 客户端没有所需的特权
```

于是整个构建以退出码 1 崩溃，`rcedit` 根本没跑，exe 的图标和版本信息全都停留在 Electron 的默认值——「应用和功能」里会显示成 `Electron`。

绕不过去的部分：app-builder 会校验下载包的 sha512，所以没法用一个改过的包去替换（本地镜像那套路子在这里行不通）。

所以本项目的做法是**彻底不用它的 rcedit**：

1. `package.json` 里设 `win.signAndEditExecutable: false`，electron-builder 就完全不碰 winCodeSign 了
2. `scripts/build.js` 自己下载工具包、跳过含符号链接的目录解压、取出 `rcedit-x64.exe` 缓存到 `build/cache/`
3. `scripts/afterpack.js` 作为 `afterPack` 钩子，照抄 electron-builder 原本的参数调用 rcedit，把图标和版本信息补上

好处是这个构建在没装开发模式、没有管理员权限的机器上都能跑通。

**如果你机器上开了开发者模式**，其实可以直接用原生流程，把上面两步去掉即可 —— 但当前这套没有额外代价，留着更省心。

## 设计取舍

### 透明窗口没有原生缩放边框

Electron 源码 `shell/browser/native_window_views.cc`：

```cpp
// Transparent window must not have thick frame.
options.Get("thickFrame", &thick_frame_);
if (transparent())
  thick_frame_ = false;
```

只要 `transparent: true`，Electron 就强制把 `thick_frame_` 置为 false，`thickFrame` 选项被**完全忽略**。没有 `WS_THICKFRAME` 就没有边缘命中测试区域，也就没有原生缩放、Aero Snap、系统投影。

所以这是一个硬性二选一，本项目选了「面板半透明 + 自实现缩放手柄」：

- 渲染进程放 8 个不可见的边缘手柄，`pointerdown` 时发一条 IPC
- 主进程用 `screen.getCursorScreenPoint()` 以 16ms 轮询光标，算增量后 `setBounds`
- 用主进程轮询而不是渲染进程的 `mousemove`，因为前者拿的是全局坐标，鼠标移出窗口后依然准确
- 光标静止超过 1.5 秒就结束会话，防止鼠标移出窗口后松手导致窗口失控

另一条退路是 `transparent: false` + `win.setOpacity()`：能换回原生缩放和投影，代价是整个窗口包括文字都会变淡，且不能做圆角。

### 必须有一层近乎不可见的底色

```css
#root { background: rgba(0, 0, 0, 0.01); }
```

Windows 上透明窗口的完全透明像素**不接收鼠标事件**。少了这层底色，贴边的缩放手柄和拖动区域会直接失效——鼠标事件会漏到桌面上。透明度滑块最小值设成 10% 而不是 0 也是同一个原因。

### drag 区域里的东西点不动

`-webkit-app-region: drag` 的区域交给操作系统做命中测试，DOM 根本收不到鼠标事件。所以所有交互元素（按钮、输入框、列表、事项文字）都必须显式 `no-drag`，漏掉任何一个都会表现为「界面看得见、点不动」。

### 图标是代码画出来的

`src/trayIcon.js` 用 Node 内置的 `zlib` 直接拼 PNG（`zlib.crc32` 从 Node 22 起内置），再用线段距离场画对勾。项目里没有任何二进制图片资源。同一个生成器扩到 256×256 套上 ICO 容器，就是打包用的 `build/icon.ico`。

### 中文路径必须走 `-EncodedCommand`

系统的控制台代码页是 gb2312，`powershell -Command "...D:\桌面\..."` 会把中文路径按 gb2312 解释而损坏。所以创建快捷方式时把脚本编码成 UTF-16LE 的 base64 传给 `-EncodedCommand`，完全绕开代码页。调用方式也必须是 `execFileSync` + 参数数组，不经过 `cmd.exe`，没有额外的转义层。

## 常见问题

**改了代码但行为没变**
没重新打包。跑 `npm run package`。

**开机没自动启动**
先看启动文件夹里 `每日及代办.lnk` 还在不在。还在的话检查目标路径——项目目录被移动或 `dist\` 被删都会导致失效，重新跑一次 `npm run package` + `node scripts/autostart-cli.js enable`。

**窗口不见了**
可能被隐藏到托盘了，点托盘图标恢复。如果窗口跑到屏幕外，直接删掉 `data.json` 重启。

**打包出来的还是旧版**
`npm run package` 会清空 `release\` 重新生成。如果你的数据出现在 `release\` 里，说明数据文件位置被改错了——数据应该始终在 `%APPDATA%\daily-widget\`。

**exe 的图标是 Electron 默认图标，或者「应用和功能」里显示成 Electron**
说明 `afterPack` 钩子没跑成功，通常是 `build/cache/rcedit-x64.exe` 没解出来。删掉 `build/cache/` 重新跑一次 `npm run package`。

**安装界面上没看到「开机自启动」那个勾选框**
它插在「选择安装目录」之后。如果 `allowToChangeInstallationDirectory` 被关掉，`customPageAfterChangeDir` 这个插入点就不会被执行。另外静默安装（`/S`）会跳过所有页面，此时按「不自启动」处理。

**npm 提示 `Unknown project config "electron_mirror"`**
`.npmrc` 里配了 Electron 二进制下载镜像（国内网络兜底）。这是 npm 对非标准配置项的警告，配置本身是生效的——`@electron/get` 会优先读取它，可以忽略。

**想让 exe 换名字**
`package.json` 里 `package` 脚本的 `DailyWidget` 参数就是 exe 名。建议保持 ASCII——中文 exe 名经过 gb2312 控制台传参会出问题。快捷方式名可以随便改（`src/autostart.js` 的 `LNK_NAME`）。
