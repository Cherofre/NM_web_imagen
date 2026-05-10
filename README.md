# 网页生图工具

这是一个本地网页工具，把两个 ComfyUI API 节点整理成可以直接填写参数的页面：

- GPT Image 2
- Banana Gemini

页面里填写 API Key、Base URL、模型名、提示词和参考图后，由本地 FastAPI 后端代发请求，避免浏览器直连外部接口时常见的 CORS 问题。

## 目录说明

- `app.py`：FastAPI 后端
- `static/`：网页界面、交互脚本和样式
- `requirements.txt`：Python 依赖
- `start_web.bat`：Windows 双击启动
- `start_web.ps1`：PowerShell 启动
- `一键启动.bat`：中文提示的一键启动脚本，适合分享给不熟悉命令行的人
- `stop_web.bat` / `stop_web.ps1`：停止本地后端服务
- `一键停止.bat`：中文名的一键停止脚本
- `package_web_tool.ps1`：打包分享脚本
- `vendor/python/`：随包便携 Python，目标电脑没有 Python 时使用
- `vendor/wheels/`：随包 Python 依赖，目标电脑缺依赖时离线安装
- `outputs/`：生成图片自动保存目录，启动或生成时自动创建
- `config.local.json`：本机配置文件，保存 API Key 时自动创建，不建议分享
- `.venv/`：依赖缺失时自动创建的本地 Python 环境，不需要提交或分享
- `.runtime/`：没有系统 Python 时自动解压出的便携运行环境，不需要提交或分享

所有运行路径都按 `web_tool` 所在目录计算，不写死电脑绝对路径。把 `web_tool` 放在中文路径下也可以正常启动和保存。

## 本机启动

### 方式 1：双击启动

双击 `一键启动.bat`。

默认地址：

```text
http://127.0.0.1:7861
```

这个脚本会自动打开网页、检查 Python 依赖，并从脚本所在目录启动后端服务。窗口不要关，关掉后网页服务也会停止。

分享包固定面向 Windows x64，脚本会优先解压 `vendor/python` 里的便携 Python 3.12 到 `.runtime` 并使用随包 `vendor/wheels` 离线准备依赖。目标电脑不需要安装 Python，也不会联网下载 Python 或 pip 依赖。如果便携 Python 或 wheels 被 SVN、网盘、手动复制漏掉，请重新使用完整 `web_imagen_tool.zip`。

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

完整分享包已经带了 Windows x64 便携 Python 3.12 和离线依赖 wheels，目标电脑没有 Python 也可以启动。正常情况下不需要手动安装依赖，双击 `一键启动.bat` 会自动解压 `.runtime` 并启动工具。如果某份 SVN 工作副本缺少 `vendor/python/python-3.12.10-embed-amd64.zip` 或 `vendor/wheels/*.whl`，请直接用完整 zip 包覆盖。

当前分享包不再把系统 Python 当作默认运行环境，避免目标电脑因为缺 `fastapi`、`uvicorn` 等依赖而触发联网安装或污染系统环境。

## 分享方式

### 方式 1：SVN 给同事

如果要把 `web_tool` 上传到 SVN，建议忽略本机运行产物，只提交源码、启动脚本和说明文档。

本目录提供了 `.svnignore`，在 `web_tool` 目录执行：

```powershell
svn propset svn:ignore -F .\.svnignore .
svn status
```

确认 `config.local.json`、`outputs/`、`logs/`、`.chrome-debug/` 这类文件没有进入 SVN 后，再提交。

同事拉下来后：

1. 进入 `web_tool`
2. 双击 `一键启动.bat`
3. 在网页里填写自己的 API Key 和 Base URL
4. 不用时双击 `一键停止.bat`

### 方式 2：zip 包给朋友

推荐用打包脚本，不要直接手动压缩整个工作目录。因为运行时可能会有 `config.local.json`、`.chrome-debug`、`logs`、`outputs` 等本机文件，里面可能包含 API Key、浏览器缓存或生成图片。

在 `web_tool` 目录运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\package_web_tool.ps1
```

默认会在上一级目录生成：

```text
web_imagen_tool.zip
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
- 服务日志和临时图片

别人解压后进入 `web_imagen_tool`，双击 `一键启动.bat` 即可使用。第一次运行时会自动准备 `.runtime`，依赖来自随包 `vendor/wheels`。不用时双击 `一键停止.bat`。

## 配置保存

- 浏览器本地保存：刷新页面后会恢复当前浏览器里的表单。
- 保存到本地文件：会写入 `web_tool/config.local.json`。
- 读取默认值：会读取环境变量或 `web_tool/config.local.json`。

分享给别人时不要把自己的 `config.local.json` 放进去，避免泄露 API Key。

## 输出图片

生成后的图片会自动保存到：

```text
web_tool/outputs/
```

页面里的素材窗口只保留当前页面会话的缩略图；真正的本地文件在 `outputs/`。

## 当前支持

### GPT Image 2

- API Key / Base URL / 模型名
- 正向提示词 / 负面提示词
- 固定尺寸或自定义尺寸
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

- API Key / Base URL / 模型名
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

## 如果要做成软件

目前最稳的分享方式是 zip 包加启动脚本。也可以进一步用 PyInstaller 打成 `.exe`，但体积会明显变大，并且仍需要用户自己填写 API Key。后续如果要做成真正的桌面小工具，可以再加一层 PyInstaller 或 Tauri 包装。
