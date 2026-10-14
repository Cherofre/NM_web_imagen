# 1.1.6 桌面图片编辑接入复核（2026-10-14）

用户发现1.1.5桌面预览只有“编辑遮罩”。根因不是资源遗漏或缓存：App按desktopMode隐藏了四个编辑工具，并把局部修改路由到旧MaskEditor。此前发布审查核对了资源入包，却没有覆盖桌面入口可达性，网页专用边界没有满足用户预期。

## 本次修复

- 桌面与网页共用ImageEditorWorkspace：预览四个入口、结果/参考底图的局部修改、失败任务继续编辑。
- 桌面启用IndexedDB草稿恢复与页面生命周期保存；原生退出前flush，保留托盘行为。
- 标注PNG增加原生另存为命令，限制25MiB并在打开对话框前核对PNG头；取消保存正常恢复编辑状态。
- 用户追加截图的主要问题是参考卡片高度不一。统一文件名26px和状态22px两行，普通图也保留状态行空间；不扩大卡片宽度。

## 验证和边界

- Node 311项通过：直接执行实际App JSX条件及事件回调，desktopMode=true和false分别覆盖四入口、按钮禁用、失败恢复、底图去重/保留遮罩，以及原生下载分支、取消/错误解除忙碌、退出等待草稿写入。
- Rust7项通过，PNG过大/非PNG/截断拒绝与既有更新器/迁移测试通过；TypeScript/Vite生产构建通过。
- 真实GUI与原生保存对话框没有通过本轮实测，管理员浏览器校验限制不能绕过；事件模拟不能冒充人类点击。
- 不使用剩余额度为零的付费接口，后端产物验收使用本机mock。
- 用户明确选择正式发布1.1.6，原1.1.5标签与包保留，采用手动下载升级，不生成未签名的直装feed。

## 产物结果

- Python323/Node311/Rust7、构建、Web本地预检、四包manifest/hash及资源新鲜度通过；main已快进合并产品提交77602f3。
- Web ZIP完整解压后用随包离线Python准备依赖并实际启动，版本1.1.6通过。
- 实际Portable ZIP解压后启动冻结exe：桌面鉴权/旧配置/当前资源、GPT多张补齐/部分完成/异常usage/Responses、standard和compat局部单调用、透明与不透明PNG判断、GPT和Banana聊天、Banana生图、任务取消不保存或补交均通过，0远端付费调用。
- 两种NSIS实际解出后核对790个后端/资源文件与Portable一致（base_library.zip按成员字节忽略时间戳）；shell嵌入当前JS/CSS通过，普通/离线WebView2内容正确。
- 两处G盘Web和桌面分发已同步；逐个核对桌面包hash和新建干净展开目录全部793个文件与实际Portable ZIP一致，旧包和用户文件保留，目标Web预检通过。
- [正式v1.1.6](https://github.com/Cherofre/NM_web_imagen/releases/tag/v1.1.6)已发布，draft=false、prerelease=false、latest API确认；12附件远端uploaded状态、大小和SHA256全部匹配本地。v1.1.5未覆盖。
- 7861 health版本1.1.6与HTML/当前JS/CSS/boot guard字节完全一致，未自动刷新用户页面或提交生图。
