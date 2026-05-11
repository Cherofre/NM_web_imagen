# NM_web_imagen

这是一个本地网页生图工具。当前主界面是 React/Vite Studio 工作台，后端仍是本地 FastAPI，用来保存配置、持久化会话、保存输出图片，并代发外部生图/聊天接口请求，避免浏览器直连外部接口时常见的 CORS 问题。

当前支持：

- GPT Image 2
- Banana Gemini
- GPT 文本聊天模型配置

默认地址：

```text
http://127.0.0.1:7861
```

## 目录说明

- `app.py`：FastAPI 后端
- `studio-web/`：React/Vite Studio 前端源码
- `static/studio/`：已构建的 Studio 前端产物，启动后默认从 `/` 打开
- `static/index.html`、`static/app.js`、`static/styles.css`：旧版静态界面，保留为 `/classic` 回滚入口
- `requirements.txt`：Python 依赖
- `start_web.bat` / `start_web.ps1`：Windows 启动脚本
- `一键启动.bat`：中文提示的一键启动脚本，适合分享给不熟悉命令行的人
- `stop_web.bat` / `stop_web.ps1`：停止本地后端服务
- `一键停止.bat`：中文名的一键停止脚本
- `package_web_tool.ps1`：打包分享脚本
- `vendor/python/`：随包便携 Python，目标电脑没有 Python 时使用
- `vendor/wheels/`：随包 Python 依赖，目标电脑缺依赖时离线安装
- `outputs/`：生成图片、历史记录、Studio 会话和参考图快照的本地保存目录，启动或生成时自动创建
- `config.local.json`：本机连接配置文件，保存 API Key 时自动创建，不建议分享
- `.runtime/`：没有系统 Python 时自动解压出的便携运行环境，不需要提交或分享

所有运行路径都按 `NM_web_imagen` 所在目录计算，不写死电脑绝对路径。放在中文路径下也可以正常启动和保存。

## 本机启动

### 方式 1：双击启动

双击 `一键启动.bat`。

这个脚本会自动打开网页、检查 Python 依赖，并从脚本所在目录启动后端服务。窗口不要关，关掉后网页服务也会停止。

如果需要英文文件名入口，也可以双击 `start_web.bat`，它和 `一键启动.bat` 使用同一套启动逻辑。

### 停止服务

关闭浏览器页面不会自动停止后端服务。如果看得到启动时的命令行窗口，可以直接关闭窗口或按 `Ctrl+C`。

如果没有看到后端窗口，双击 `一键停止.bat`。它会查找默认 `7861` 端口上运行的本工具后端并停止，不会删除配置或输出图片。

如果启动时使用了其它端口，可以在 PowerShell 中指定端口：

```powershell
.\stop_web.ps1 -Port 7861
```

### 方式 2：PowerShell 启动

```powershell
.\start_web.ps1
```

指定端口：

```powershell
.\start_web.ps1 -Port 7861
```

### 方式 3：命令行启动

```powershell
python .\app.py --host 127.0.0.1 --port 7861
```

## 环境要求

完整分享包已经带了 Windows x64 便携 Python 3.12 和离线依赖 wheels。目标电脑没有 Python 也可以启动。正常情况下不需要手动安装依赖，双击 `一键启动.bat` 会自动解压 `.runtime` 并启动工具。

如果某份 SVN 工作副本缺少 `vendor/python/python-3.12.10-embed-amd64.zip` 或 `vendor/wheels/*.whl`，请直接用完整 `NM_web_imagen.zip` 包覆盖。

## 分享方式

### 方式 1：SVN 给同事

如果要把 `NM_web_imagen` 上传到 SVN，建议忽略本机运行产物，只提交源码、构建产物、启动脚本、离线运行依赖和说明文档。

本目录提供了 `.svnignore`，在 `NM_web_imagen` 目录执行：

```powershell
svn propset svn:ignore -F .\.svnignore .
svn status
```

确认 `config.local.json`、`outputs/`、`logs/`、`.chrome-debug/`、`.runtime/` 这类文件没有进入 SVN 后，再提交。

同事拉下来后：

1. 进入 `NM_web_imagen`
2. 双击 `一键启动.bat`
3. 在网页里填写自己的 API Key、API 请求地址和模型名
4. 不用时双击 `一键停止.bat`

### 方式 2：zip 包给朋友

推荐用打包脚本，不要直接手动压缩整个工作目录。因为运行时可能会有 `config.local.json`、`.chrome-debug`、`logs`、`outputs` 等本机文件，里面可能包含 API Key、浏览器缓存或生成图片。

在 `NM_web_imagen` 目录运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\package_web_tool.ps1
```

默认会在上一级目录生成：

```text
NM_web_imagen.zip
```

这个 zip 会自动排除：

- `config.local.json`
- `outputs/`
- `logs/`
- `.chrome-debug/`
- `.venv/`
- `.runtime/`
- `.git/` / `.svn/`
- `saved_images/`
- `__pycache__/`
- 服务日志、测试截图和临时图片

别人解压后进入 `NM_web_imagen`，双击 `一键启动.bat` 即可使用。第一次运行时会自动准备 `.runtime`，依赖来自随包 `vendor/wheels`。不用时双击 `一键停止.bat`。

## 配置与会话保存

- 保存配置：写入 `NM_web_imagen/config.local.json`，只保存连接字段，例如 API Key、API 请求地址、模型名、当前引擎和版本。
- Studio 会话：写入 `NM_web_imagen/outputs/studio_sessions.json`。
- 会话参考图快照：写入 `NM_web_imagen/outputs/session_refs/`，后端会按数量和容量上限清理。
- 生成历史：写入 `NM_web_imagen/outputs/history.json`。

分享给别人时不要把自己的 `config.local.json` 或 `outputs/` 放进去，避免泄露 API Key、提示词或生成图片。

## 输出图片

生成后的图片会自动保存到：

```text
NM_web_imagen/outputs/
```

页面里的素材和历史会读取本地输出记录；真正的图片文件也在 `outputs/`。

## 当前支持

### GPT Image 2

- API Key / API 请求地址 / 生图模型
- 聊天模型和思考强度
- 正向提示词 / 负面提示词
- 画面文字
- 1K / 2K / 4K 尺寸档和比例
- 自定义尺寸校正
- 质量
- 数量
- 随机种子
- 风格预设
- 返回格式
- 编辑模式
- 接口类型（auto / generations / edits / responses）
- 参考强度
- 超时 / 无限超时
- 最多 16 张参考图

### Banana Gemini

- API Key / API 请求地址 / 模型名
- 提示词
- 批量数量
- 随机种子
- 比例
- 图像分辨率
- Top-P
- 超时 / 无限超时
- 绕过代理
- 禁用 SSL 校验
- 最多 14 张参考图

## 前端开发

Studio 前端源码在 `studio-web/`。修改后需要重新构建到 `static/studio/`：

```powershell
cd .\studio-web
npm install
npm run build
```

尺寸规则有独立校验：

```powershell
cd .\studio-web
npm run test:size
```

## 基础验证

```powershell
$env:PYTHONUTF8='1'
python -m py_compile .\app.py
```

如果要完整启动验证：

```powershell
.\start_web.ps1
```

然后打开：

```text
http://127.0.0.1:7861/api/health
```
