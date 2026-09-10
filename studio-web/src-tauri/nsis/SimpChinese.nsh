; Simplified Chinese strings for the NM Image Studio NSIS installer.
;
; Mirrors the keys Tauri's bundled English.nsh defines. Tauri only ships English
; translations for its own installer messages, so this file must define every
; key that installer.nsi references, otherwise makensis fails with an unknown
; LangString. Keep it in sync with
; https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-bundler/src/bundle/windows/nsis/languages/English.nsh
; (27 keys as of @tauri-apps/cli 2.9.2).

LangString addOrReinstall ${LANG_SIMPCHINESE} "添加/重新安装组件"
LangString alreadyInstalled ${LANG_SIMPCHINESE} "已安装"
LangString alreadyInstalledLong ${LANG_SIMPCHINESE} "${PRODUCTNAME} ${VERSION} 已经安装。请选择要执行的操作，然后点击“下一步”继续。"
LangString appRunning ${LANG_SIMPCHINESE} "${PRODUCTNAME} 正在运行！请先关闭它，然后重试。"
LangString appRunningOkKill ${LANG_SIMPCHINESE} "${PRODUCTNAME} 正在运行！$\n点击“确定”结束它。"
LangString chooseMaintenanceOption ${LANG_SIMPCHINESE} "请选择要执行的维护操作。"
LangString choowHowToInstall ${LANG_SIMPCHINESE} "请选择安装 ${PRODUCTNAME} 的方式。"
LangString createDesktop ${LANG_SIMPCHINESE} "创建桌面快捷方式"
LangString dontUninstall ${LANG_SIMPCHINESE} "不卸载旧版本，直接覆盖安装"
LangString dontUninstallDowngrade ${LANG_SIMPCHINESE} "不卸载旧版本（本安装程序不允许不卸载直接降级安装）"
LangString failedToKillApp ${LANG_SIMPCHINESE} "无法结束 ${PRODUCTNAME}。请先手动关闭它，然后重试。"
LangString installingWebview2 ${LANG_SIMPCHINESE} "正在安装 WebView2……"
LangString newerVersionInstalled ${LANG_SIMPCHINESE} "系统中已安装更新版本的 ${PRODUCTNAME}！不建议安装旧版本；如果确实要安装，建议先卸载当前版本。请选择要执行的操作，然后点击“下一步”继续。"
LangString older ${LANG_SIMPCHINESE} "更旧的"
LangString olderOrUnknownVersionInstalled ${LANG_SIMPCHINESE} "系统中安装的是 $R4 版本的 ${PRODUCTNAME}。建议在安装前先卸载当前版本。请选择要执行的操作，然后点击“下一步”继续。"
LangString silentDowngrades ${LANG_SIMPCHINESE} "本安装程序不允许降级安装，无法继续静默安装，请改用图形界面安装程序。$\n"
LangString unableToUninstall ${LANG_SIMPCHINESE} "无法卸载！"
LangString uninstallApp ${LANG_SIMPCHINESE} "卸载 ${PRODUCTNAME}"
LangString uninstallBeforeInstalling ${LANG_SIMPCHINESE} "先卸载旧版本再安装"
LangString unknown ${LANG_SIMPCHINESE} "未知"
LangString webview2AbortError ${LANG_SIMPCHINESE} "WebView2 安装失败！缺少它应用无法运行。请重启安装程序后重试。"
LangString webview2DownloadError ${LANG_SIMPCHINESE} "错误：下载 WebView2 失败 - $0"
LangString webview2DownloadSuccess ${LANG_SIMPCHINESE} "WebView2 引导程序下载成功"
LangString webview2Downloading ${LANG_SIMPCHINESE} "正在下载 WebView2 引导程序……"
LangString webview2InstallError ${LANG_SIMPCHINESE} "错误：安装 WebView2 失败，退出码 $1"
LangString webview2InstallSuccess ${LANG_SIMPCHINESE} "WebView2 安装成功"
LangString deleteAppData ${LANG_SIMPCHINESE} "删除应用数据"
