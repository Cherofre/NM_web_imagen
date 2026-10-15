# 移除背景拒绝原因实查（2026-10-15）

## 已确认结果

用户授权新增 **1次** KB透明图片请求后，15:41:34（Asia/Shanghai）使用原始失败参考图、`「KB」gpt-image-2`，直接请求`/v1/images/edits`。约30.44秒返回HTTP451，0张图片，无重试、无改模型或移除透明参数。请求参数为`n=1`、`size=auto`、`background=transparent`、`output_format=png`及现有内置抠图提示词，图片使用`image[]`上传；按官方最小参数省略可选quality，与旧请求不保证逐字段相同。

响应的结构化错误明确为：

```json
{
  "code": "ERR-D2C10AD220",
  "type": "content_policy_violation",
  "message": "Your request has been blocked for safety reasons."
}
```

渠道请求编号：`202610150741342299466128268d9d6ne6CDmSC`。

这证明本次透明请求在KB这条服务链路被安全审核拦截。响应没有说明触发条款，也未给出原图、提示词、渠道自有规则或更上游审核的细分归因；不能据此断言官方模型不支持透明、原图必然违规，或删除某个参数就能解决。旧失败响应正文没有保存，本次结果不能反向还原所有旧403/451的原因。

## 历史对照

通过保存的会话时间、模型与耗时对应桌面日志（时间均UTC+8）：

| 发起时间 | 模型 | 结果 | 耗时 |
| --- | --- | --- | --- |
| 10:36:46 | YS gpt-image-2.5-sunburst | 403 | 1.77秒 |
| 10:37:00 | CS gpt-image-2 | 403 | 267.30秒 |
| 10:42:44 | XJ gpt-image-2 | ReadTimeout | 300.23秒 |
| 14:42:12 | KB gpt-image-2 | 451 | 26.51秒 |

用户确认随后改在主输入框生成。14:43和15:11两张KB结果是RGB PNG、1048576像素全部不透明；历史`image_edit_action`为空，没有background_validation。令牌自己的成功日志显示这两次也走`/v1/images/edits`，因此不能把问题归因为编辑路由整体不可用。

现有令牌的只读`/api/log/token`返回31条，均为type=2成功消费，无失败错误正文；`/v1/models`有KB/CS/XJ相关条目，没有当前配置选中的YS名称。未改配置，未访问管理员日志或发送额外付费诊断；模型列表不等于透明能力声明。

## 本地提示修正（源码，未打包）

原来451被归类成通用“请检查模型与生成参数”，且403都提示认证问题。对移除背景请求，现改为读取结构化`error.type`/`error.code`：明确`content_policy_violation`或`moderation_blocked`时，显示固定的“图片服务的安全审核拒绝了此请求，移除背景未完成”，记录拒绝分类和受限格式的渠道请求编号。不回显错误原文、密钥、地址或私有提示词，不按HTTP451或消息里提到policy就猜原因。

修改保持单请求、禁止自动重试/换模型/降级透明输出。新增测试复现451旧错误提示，验证400/403/451的明确安全分类、未知451不误判及恶意请求编号不泄露。定向安全边界83项、全量后端331项与编译通过。当前用户安装的1.1.6未更改，需要后续构建桌面包才能显示新提示；没有覆盖已发布资产。

## 官方依据和后续

- [OpenAI图片编辑接口](https://developers.openai.com/api/reference/resources/images/methods/edit)：gpt-image-2透明输出为preview，显式transparent与PNG/WebP。
- [官方透明抠图示例](https://developers.openai.com/api/docs/guides/image-prompting#create-a-transparent-product-cutout)：图像Alpha是透明结果的依据，画棋盘格不算透明。
- [New API令牌日志实现](https://github.com/QuantumNous/new-api/blob/main/controller/log.go)：按当前令牌读取自己的日志，不需要也未尝试管理员访问。

要进一步了解具体审核原因，可以向服务方提供以上时间和请求编号核查；本轮没有授权发送消息给服务方，也未代发。新增1次额度已用尽，不自动再次尝试或寻找绕过审核的请求组合。

脱敏运行记录在`.runtime/background-live-result-20261015.json`、`background-live-budget-20261015.json`，令牌日志摘要在`.runtime/background-channel-20261015.json`；它们均不进入分发包。桌面配置使用DPAPI，诊断仅在内存中调用现有解密函数，不输出或落盘明文密钥。首次只读探测误用了密文而得到401，解密后两GET均200；这个401与真实生图失败无关。
