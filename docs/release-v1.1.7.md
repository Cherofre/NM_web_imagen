# 1.1.7 正式发布结果

2026-11-07 15:46:24（Asia/Shanghai），用户明确要求「那就发布吧」后完成正式发布：

[GitHub Release v1.1.7](https://github.com/Cherofre/NM_web_imagen/releases/tag/v1.1.7)

- `draft=false`、`prerelease=false`，latest接口确认v1.1.7。
- 已验收产品提交 `698dfcae021ae37600c1994f37104769b258d969`；main快进推送，注解标签v1.1.7指向此提交。后续交接文档提交不改变产品标签或发行包。
- 四种包及各自manifest/SHA256共12附件，逐一核对远端uploaded状态、字节数和GitHub提供的SHA256，全部与本地相同；中文正文与 `release-notes-v1.1.7.md` 一致。
- 候选构建、依赖audit0、Python345/Node316/Rust10、冻结mock、真实本机覆盖升级及用户原生显示确认的详细证据见 `release-candidate-v1.1.7.md`；本轮复核包内容/源码身份及预检，没有新增产品改动或付费请求，也没有重复安装用户程序。

## G盘分发

两处既有分发均同步至1.1.7，并通过 `release_preflight.ps1`：

- `G:/doc/Tools/AI产出工具插件/美术/特效组/网页生图工具`
- `G:/doc/Tools/网页生图站`

两处Web工程分别54文件，逐文件对应新版ZIP；根目录新增1.1.7 Web ZIP及更新说明。两处桌面三包均逐文件SHA256匹配本地。

公司目录Desktop最终恰好三个1.1.7包与原有说明，未创建便携展开目录、hash或manifest。按既有脚本把识别到的旧1.1.5/1.1.6桌面包移至本地 `_release/share-backups`，不是丢弃旧包。另一处目录沿用已有布局，保留旧桌面包和校验文件，更新已有便携展开目录793个文件；更新前确认其与1.1.6包完全相同且无data，另完整备份到 `_release/share-backups/release117-standalone-portable`。

两处Web目录各有两个多余的旧生成资源，先逐文件备份到 `_release/share-backups/release117-extra-assets`，再同步干净工程。根目录说明、素材及历史包共94文件的原SHA256全部保留。详见 `.runtime/release117-share-final.json`。

## 发布链路验证记录

- GitHub连接器不提供Release附件上传，本轮用已配置gh CLI完成草稿、上传、验证和正式发布；用户明确授权发布，无额外确认。
- 切换/快进main时，Windows core.autocrlf把生成JS/CSS工作副本变为CRLF，字节新鲜度检查正确阻止Web同步。确认HEAD blob与已验包完全一致后，将工作副本生成资源恢复为包内原始字节，刷新Git索引，产品内容和提交均未改变；四包再次通过身份检查后继续。
- GitHub草稿的按tag REST查询返回404，但列表和数字release id437420496可访问。上传完成后按实际id核验12附件，再转正式发布，最终按tag与latest查询均通过；未重复创建草稿或重复上传。
- 本轮保留当前已升级1.1.7桌面实例及所有恢复/安装备份，不更换用户存图目录。此前两张9/10旧源图缺失仍按数据恢复报告记录，不属于新增升级丢图。原生显示验收来自用户确认，不声称原生自动化控制器或保存对话框已通过。

主要证据：`.runtime/release117-github-metadata.json`、`release117-finish-publish.log`、`release117-company-preflight.log`、`release117-standalone-preflight.log`、`release117-share-final.json`。当前正式发布与约定的G同步均已完成，无本轮剩余待办；保持既有手动升级/签名策略。
