# openclaw-feishu

Feishu/Lark (飞书) channel plugin for [OpenClaw](https://github.com/openclaw/openclaw).

[English](#english) | [中文](#中文)

---

## English

### Installation

```bash
openclaw plugins install @mahmut-abi/feishu
```

Or install via npm:

```bash
npm install @mahmut-abi/feishu
```

### Configuration

1. Create a self-built app on [Feishu Open Platform](https://open.feishu.cn)
2. Get your App ID and App Secret from the Credentials page
3. Enable required permissions (see below)
4. **Configure event subscriptions** (see below) ⚠️ Important
5. Configure the plugin:

#### Required Permissions

| Permission | Scope | Description |
|------------|-------|-------------|
| `contact:user.base:readonly` | User info | Get basic user info (required to resolve sender display names for speaker attribution) |
| `im:message` | Messaging | Send and receive messages |
| `im:message.p2p_msg:readonly` | DM | Read direct messages to bot |
| `im:message.group_at_msg:readonly` | Group | Receive @mention messages in groups |
| `im:message:send_as_bot` | Send | Send messages as the bot |
| `im:resource` | Media | Upload and download images/files |

#### Optional Permissions

| Permission | Scope | Description |
|------------|-------|-------------|
| `im:message.group_msg` | Group | Read all group messages (sensitive) |
| `im:message:readonly` | Read | Get message history |
| `im:message:update` | Edit | Update/edit sent messages |
| `im:message:recall` | Recall | Recall sent messages |
| `im:message.reactions:read` | Reactions | View message reactions |

#### Event Subscriptions ⚠️

> **This is the most commonly missed configuration!** If the bot can send messages but cannot receive them, check this section.

In the Feishu Open Platform console, go to **Events & Callbacks**:

1. **Event configuration**: Select **Long connection** (recommended)
2. **Add event subscriptions**:

| Event | Description |
|-------|-------------|
| `im.message.receive_v1` | Receive messages (required) |
| `im.message.message_read_v1` | Message read receipts |
| `im.chat.member.bot.added_v1` | Bot added to group |
| `im.chat.member.bot.deleted_v1` | Bot removed from group |

3. Ensure the event permissions are approved

```bash
openclaw config set channels.feishu.appId "cli_xxxxx"
openclaw config set channels.feishu.appSecret "your_app_secret"
openclaw config set channels.feishu.enabled true
```

### Configuration Options

```yaml
channels:
  feishu:
    enabled: true
    appId: "cli_xxxxx"
    appSecret: "secret"
    # Domain: "feishu" (China) or "lark" (International)
    domain: "feishu"
    # Connection mode: "websocket" (recommended) or "webhook"
    connectionMode: "websocket"
    # DM policy: "pairing" | "open" | "allowlist"
    dmPolicy: "pairing"
    # Group policy: "open" | "allowlist" | "disabled"
    groupPolicy: "allowlist"
    # Require @mention in groups
    requireMention: true
    # Max media size in MB (default: 30)
    mediaMaxMb: 30
    # Render mode for bot replies: "auto" | "raw" | "card"
    renderMode: "auto"
```

#### Complete Configuration Example

```yaml
channels:
  feishu:
    # Enable/disable the channel
    enabled: true

    # Feishu App credentials
    appId: "cli_xxxxxxxxxxxxxxxx"
    appSecret: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

    # Domain: "feishu" (China) or "lark" (International)
    domain: "feishu"

    # Connection mode: "websocket" (recommended) or "webhook"
    connectionMode: "websocket"

    # Webhook configuration (only for webhook mode)
    webhookPath: "/feishu/events"
    webhookPort: 3000

    # Encryption settings (optional, for webhook mode)
    encryptKey: "your_encrypt_key"
    verificationToken: "your_verification_token"

    # Direct message policy
    dmPolicy: "pairing"  # "pairing" | "open" | "allowlist"
    allowFrom: ["*"]  # For "open" policy, must include "*"

    # Group chat policy
    groupPolicy: "allowlist"  # "open" | "allowlist" | "disabled"
    groupAllowFrom: ["oc_xxxxxxxxxxxxxxxx", "user_id"]
    requireMention: true  # Require @mention in groups

    # Media settings
    mediaMaxMb: 30  # Max media file size in MB

    # Render mode for bot replies
    renderMode: "auto"  # "auto" | "raw" | "card"

    # Markdown settings
    markdown:
      mode: "native"  # "native" | "escape" | "strip"
      tableMode: "native"  # "native" | "ascii" | "simple"

    # Message history limits
    historyLimit: 100  # Max messages to fetch for group chats
    dmHistoryLimit: 50  # Max messages to fetch for DMs

    # Text chunk settings for long messages
    textChunkLimit: 2000  # Max characters per chunk
    chunkMode: "length"  # "length" | "newline"

    # Streaming coalesce settings
    blockStreamingCoalesce:
      enabled: true
      minDelayMs: 100
      maxDelayMs: 500

    # Heartbeat visibility settings
    heartbeat:
      visibility: "hidden"  # "visible" | "hidden"
      intervalMs: 300000  # 5 minutes

    # Per-group configuration (overrides global settings)
    groups:
      "oc_group_id_1":
        enabled: true
        requireMention: false
        systemPrompt: "You are a helpful assistant"
        skills: ["web_search", "file_analysis"]
        tools:
          allow: ["*"]
        allowFrom: ["user_id_1", "user_id_2"]

    # Per-DM configuration
    dms:
      "user_id_1":
        enabled: true
        systemPrompt: "You are a personal assistant"

    # Capabilities (optional)
    capabilities: ["send", "receive", "media"]
```

#### Configuration Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | - | Enable/disable the channel |
| `appId` | string | - | Feishu App ID |
| `appSecret` | string | - | Feishu App Secret |
| `domain` | enum | `"feishu"` | `"feishu"` (China) or `"lark"` (International) |
| `connectionMode` | enum | `"websocket"` | `"websocket"` or `"webhook"` |
| `webhookPath` | string | `"/feishu/events"` | Webhook endpoint path (webhook mode) |
| `webhookPort` | number | - | Webhook server port (webhook mode) |
| `encryptKey` | string | - | Encryption key (webhook mode, optional) |
| `verificationToken` | string | - | Verification token (webhook mode, optional) |
| `dmPolicy` | enum | `"pairing"` | `"pairing"` | `"open"` | `"allowlist"` |
| `allowFrom` | array | - | Allowed users for DM (for "open" policy, must include `"*"`) |
| `groupPolicy` | enum | `"allowlist"` | `"open"` | `"allowlist"` | `"disabled"` |
| `groupAllowFrom` | array | - | Allowed group IDs (for "allowlist" policy) |
| `requireMention` | boolean | `true` | Require @mention in groups |
| `mediaMaxMb` | number | `30` | Max media file size in MB |
| `renderMode` | enum | `"auto"` | `"auto"` | `"raw"` | `"card"` |
| `historyLimit` | number | - | Max messages to fetch for group chats |
| `dmHistoryLimit` | number | - | Max messages to fetch for DMs |
| `textChunkLimit` | number | - | Max characters per message chunk |
| `chunkMode` | enum | - | `"length"` or `"newline"` |
| `markdown.mode` | enum | - | `"native"` | `"escape"` | `"strip"` |
| `markdown.tableMode` | enum | - | `"native"` | `"ascii"` | `"simple"` |

#### DM Policies

| Policy | Description |
|--------|-------------|
| `pairing` | Users must send `/pair` command to initiate DM with the bot |
| `open` | Anyone can DM the bot (requires `allowFrom: ["*"]`) |
| `allowlist` | Only users in `allowFrom` list can DM the bot |

#### Group Policies

| Policy | Description |
|--------|-------------|
| `open` | Bot responds to all groups where it's added |
| `allowlist` | Bot only responds to groups in `groupAllowFrom` list |
| `disabled` | Bot doesn't respond to group messages |

#### Render Mode

| Mode | Description |
|------|-------------|
| `auto` | (Default) Automatically detect: use card for messages with code blocks or tables, plain text otherwise. |
| `raw` | Always send replies as plain text. Markdown tables are converted to ASCII. |
| `card` | Always send replies as interactive cards with full markdown rendering (syntax highlighting, tables, clickable links). |

### Features

- WebSocket and Webhook connection modes
- Direct messages and group chats
- Message replies and quoted message context
- **Inbound media support**: AI can see images, read files (PDF, Excel, etc.), and process rich text with embedded images
- Image and file uploads (outbound)
- Typing indicator (via emoji reactions)
- Pairing flow for DM approval
- User and group directory lookup
- **Card render mode**: Optional markdown rendering with syntax highlighting

### FAQ

#### Bot cannot receive messages

Check the following:
1. Have you configured **event subscriptions**? (See Event Subscriptions section)
2. Is the event configuration set to **long connection**?
3. Did you add the `im.message.receive_v1` event?
4. Are the permissions approved?

#### 403 error when sending messages

Ensure `im:message:send_as_bot` permission is approved.

#### How to clear history / start new conversation

Send `/new` command in the chat.

#### Why is the output not streaming

Feishu API has rate limits. We use Feishu's native streaming configuration (`streaming_config`) to handle updates on the client side, which provides a smooth streaming experience while respecting rate limits.

#### Windows install error `spawn npm ENOENT`

If `openclaw plugins install` fails, install manually:

```bash
# 1. Download the package
curl -O https://registry.npmjs.org/@mahmut-abi/feishu/-/feishu-0.1.4.tgz

# 2. Install from local file
openclaw plugins install ./feishu-0.1.4.tgz
```

#### Cannot find the bot in Feishu

1. Ensure the app is published (at least to test version)
2. Search for the bot name in Feishu search box
3. Check if your account is in the app's availability scope

---

## 中文

### 安装

```bash
openclaw plugins install @mahmut-abi/feishu
```

或通过 npm 安装：

```bash
npm install @mahmut-abi/feishu
```

### 配置

1. 在 [飞书开放平台](https://open.feishu.cn) 创建自建应用
2. 在凭证页面获取 App ID 和 App Secret
3. 开启所需权限（见下方）
4. **配置事件订阅**（见下方）⚠️ 重要
5. 配置插件：

#### 必需权限

| 权限 | 范围 | 说明 |
|------|------|------|
| `contact:user.base:readonly` | 用户信息 | 获取用户基本信息（用于解析发送者姓名，避免群聊/私聊把不同人当成同一说话者） |
| `im:message` | 消息 | 发送和接收消息 |
| `im:message.p2p_msg:readonly` | 私聊 | 读取发给机器人的私聊消息 |
| `im:message.group_at_msg:readonly` | 群聊 | 接收群内 @机器人 的消息 |
| `im:message:send_as_bot` | 发送 | 以机器人身份发送消息 |
| `im:resource` | 媒体 | 上传和下载图片/文件 |

#### 可选权限

| 权限 | 范围 | 说明 |
|------|------|------|
| `im:message.group_msg` | 群聊 | 读取所有群消息（敏感） |
| `im:message:readonly` | 读取 | 获取历史消息 |
| `im:message:update` | 编辑 | 更新/编辑已发送消息 |
| `im:message:recall` | 撤回 | 撤回已发送消息 |
| `im:message.reactions:read` | 表情 | 查看消息表情回复 |

#### 事件订阅 ⚠️

> **这是最容易遗漏的配置！** 如果机器人能发消息但收不到消息，请检查此项。

在飞书开放平台的应用后台，进入 **事件与回调** 页面：

1. **事件配置方式**：选择 **使用长连接接收事件**（推荐）
2. **添加事件订阅**，勾选以下事件：

| 事件 | 说明 |
|------|------|
| `im.message.receive_v1` | 接收消息（必需） |
| `im.message.message_read_v1` | 消息已读回执 |
| `im.chat.member.bot.added_v1` | 机器人进群 |
| `im.chat.member.bot.deleted_v1` | 机器人被移出群 |

3. 确保事件订阅的权限已申请并通过审核

```bash
openclaw config set channels.feishu.appId "cli_xxxxx"
openclaw config set channels.feishu.appSecret "your_app_secret"
openclaw config set channels.feishu.enabled true
```

### 配置选项

```yaml
channels:
  feishu:
    enabled: true
    appId: "cli_xxxxx"
    appSecret: "secret"
    # 域名: "feishu" (国内) 或 "lark" (国际)
    domain: "feishu"
    # 连接模式: "websocket" (推荐) 或 "webhook"
    connectionMode: "websocket"
    # 私聊策略: "pairing" | "open" | "allowlist"
    dmPolicy: "pairing"
    # 群聊策略: "open" | "allowlist" | "disabled"
    groupPolicy: "allowlist"
    # 群聊是否需要 @机器人
    requireMention: true
    # 媒体文件最大大小 (MB, 默认 30)
    mediaMaxMb: 30
    # 回复渲染模式: "auto" | "raw" | "card"
    renderMode: "auto"
```

#### 完整配置示例

```yaml
channels:
  feishu:
    # 启用/禁用频道
    enabled: true

    # 飞书应用凭证
    appId: "cli_xxxxxxxxxxxxxxxx"
    appSecret: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

    # 域名: "feishu" (国内) 或 "lark" (国际)
    domain: "feishu"

    # 连接模式: "websocket" (推荐) 或 "webhook"
    connectionMode: "websocket"

    # Webhook 配置（仅用于 webhook 模式）
    webhookPath: "/feishu/events"
    webhookPort: 3000

    # 加密设置（可选，用于 webhook 模式）
    encryptKey: "your_encrypt_key"
    verificationToken: "your_verification_token"

    # 私聊策略
    dmPolicy: "pairing"  # "pairing" | "open" | "allowlist"
    allowFrom: ["*"]  # "open" 策略必须包含 "*"

    # 群聊策略
    groupPolicy: "allowlist"  # "open" | "allowlist" | "disabled"
    groupAllowFrom: ["oc_xxxxxxxxxxxxxxxx", "user_id"]
    requireMention: true  # 群聊是否需要 @机器人

    # 媒体设置
    mediaMaxMb: 30  # 媒体文件最大大小（MB）

    # 回复渲染模式
    renderMode: "auto"  # "auto" | "raw" | "card"

    # Markdown 设置
    markdown:
      mode: "native"  # "native" | "escape" | "strip"
      tableMode: "native"  # "native" | "ascii" | "simple"

    # 消息历史记录限制
    historyLimit: 100  # 群聊获取的最大消息数
    dmHistoryLimit: 50  # 私聊获取的最大消息数

    # 文本分块设置（长消息）
    textChunkLimit: 2000  # 每块最大字符数
    chunkMode: "length"  # "length" | "newline"

    # 流式更新合并设置
    blockStreamingCoalesce:
      enabled: true
      minDelayMs: 100
      maxDelayMs: 500

    # 心跳可见性设置
    heartbeat:
      visibility: "hidden"  # "visible" | "hidden"
      intervalMs: 300000  # 5 分钟

    # 每个群组的配置（覆盖全局设置）
    groups:
      "oc_group_id_1":
        enabled: true
        requireMention: false
        systemPrompt: "你是一个有用的助手"
        skills: ["web_search", "file_analysis"]
        tools:
          allow: ["*"]
        allowFrom: ["user_id_1", "user_id_2"]

    # 每个私聊的配置
    dms:
      "user_id_1":
        enabled: true
        systemPrompt: "你是我的个人助手"

    # 能力（可选）
    capabilities: ["send", "receive", "media"]
```

#### 配置参数参考

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | - | 启用/禁用频道 |
| `appId` | string | - | 飞书应用 ID |
| `appSecret` | string | - | 飞书应用密钥 |
| `domain` | enum | `"feishu"` | `"feishu"`（国内）或 `"lark"`（国际） |
| `connectionMode` | enum | `"websocket"` | `"websocket"` 或 `"webhook"` |
| `webhookPath` | string | `"/feishu/events"` | Webhook 端点路径（webhook 模式） |
| `webhookPort` | number | - | Webhook 服务器端口（webhook 模式） |
| `encryptKey` | string | - | 加密密钥（webhook 模式，可选） |
| `verificationToken` | string | - | 验证令牌（webhook 模式，可选） |
| `dmPolicy` | enum | `"pairing"` | `"pairing"` | `"open"` | `"allowlist"` |
| `allowFrom` | array | - | 允许私聊的用户（"open" 策略必须包含 `"*"`） |
| `groupPolicy` | enum | `"allowlist"` | `"open"` | `"allowlist"` | `"disabled"` |
| `groupAllowFrom` | array | - | 允许的群组 ID（"allowlist" 策略） |
| `requireMention` | boolean | `true` | 群聊是否需要 @机器人 |
| `mediaMaxMb` | number | `30` | 媒体文件最大大小（MB） |
| `renderMode` | enum | `"auto"` | `"auto"` | `"raw"` | `"card"` |
| `historyLimit` | number | - | 群聊获取的最大消息数 |
| `dmHistoryLimit` | number | - | 私聊获取的最大消息数 |
| `textChunkLimit` | number | - | 每条消息块的最大字符数 |
| `chunkMode` | enum | - | `"length"` 或 `"newline"` |
| `markdown.mode` | enum | - | `"native"` | `"escape"` | `"strip"` |
| `markdown.tableMode` | enum | - | `"native"` | `"ascii"` | `"simple"` |

#### 私聊策略

| 策略 | 说明 |
|------|------|
| `pairing` | 用户必须发送 `/pair` 命令才能开始与机器人私聊 |
| `open` | 任何人都可以与机器人私聊（需要 `allowFrom: ["*"]`） |
| `allowlist` | 只有 `allowFrom` 列表中的用户可以与机器人私聊 |

#### 群聊策略

| 策略 | 说明 |
|------|------|
| `open` | 机器人响应所有添加了它的群组 |
| `allowlist` | 机器人只响应 `groupAllowFrom` 列表中的群组 |
| `disabled` | 机器人不响应群组消息 |

#### 渲染模式

| 模式 | 说明 |
|------|------|
| `auto` | （默认）自动检测：有代码块或表格时用卡片，否则纯文本 |
| `raw` | 始终纯文本，表格转为 ASCII |
| `card` | 始终使用卡片，支持语法高亮、表格、链接等 |

### 功能

- WebSocket 和 Webhook 连接模式
- 私聊和群聊
- 消息回复和引用上下文
- **入站媒体支持**：AI 可以看到图片、读取文件（PDF、Excel 等）、处理富文本中的嵌入图片
- 图片和文件上传（出站）
- 输入指示器（通过表情回复实现）
- 私聊配对审批流程
- 用户和群组目录查询
- **卡片渲染模式**：支持语法高亮的 Markdown 渲染

### 常见问题

#### 机器人收不到消息

检查以下配置：
1. 是否配置了 **事件订阅**？（见上方事件订阅章节）
2. 事件配置方式是否选择了 **长连接**？
3. 是否添加了 `im.message.receive_v1` 事件？
4. 相关权限是否已申请并审核通过？

#### 返回消息时 403 错误

确保已申请 `im:message:send_as_bot` 权限，并且权限已审核通过。

#### 如何清理历史会话 / 开启新对话

在聊天中发送 `/new` 命令即可开启新对话。

#### 消息为什么不是流式输出

飞书 API 有请求频率限制。我们使用飞书原生的流式配置（`streaming_config`）在客户端处理更新，在遵守频率限制的同时提供流畅的流式体验。

#### Windows 安装报错 `spawn npm ENOENT`

如果 `openclaw plugins install` 失败，可以手动安装：

```bash
# 1. 下载插件包
curl -O https://registry.npmjs.org/@mahmut-abi/feishu/-/feishu-0.1.4.tgz

# 2. 从本地安装
openclaw plugins install ./feishu-0.1.4.tgz
```

#### 在飞书里找不到机器人

1. 确保应用已发布（至少发布到测试版本）
2. 在飞书搜索框中搜索机器人名称
3. 检查应用可用范围是否包含你的账号

---

## License

MIT
