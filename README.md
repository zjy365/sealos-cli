# Sealos CLI

一个强大的命令行工具，让开发者可以通过终端轻松管理 Sealos 云平台资源。

## ✨ 特性

- 🚀 **快速部署** - 一键创建开发环境和应用
- 💻 **开发友好** - 支持 VSCode/Cursor 直接连接
- 📦 **对象存储** - 简单的文件上传和静态网站托管
- 🗄️ **数据库管理** - 轻松创建和管理各类数据库
- 🔐 **安全认证** - OAuth 2.0 浏览器授权登录
- ⚙️ **灵活配置** - 支持配置文件和环境变量

## 📦 安装

```bash
# macOS / Linux
curl -fsSL https://get.sealos.io/cli | bash

# 或者使用 Homebrew
brew install sealos/tap/sealos

# 验证安装
sealos version
```

## 🚀 快速开始

```bash
# 1. 登录到 Sealos
sealos login hzh.sealos.run

# 2. 创建开发环境
sealos devbox create . --template=nextjs

# 3. 连接到开发环境
sealos devbox connect my-devbox --ide=cursor

# 4. 查看所有资源
sealos devbox list
sealos quota
```

## 📚 主要功能

### Devbox 开发环境

```bash
# 创建开发环境
sealos devbox create /path/to/project \
  --template=nextjs \
  --cpu=2c \
  --memory=4g

# 连接到 IDE
sealos devbox connect my-devbox --ide=vscode

# 管理开发环境
sealos devbox list
sealos devbox stop my-devbox
sealos devbox start my-devbox
```

### 对象存储

```bash
# 上传静态网站
sealos s3 upload ./dist --bucket=my-website

# 列出文件
sealos s3 list --bucket=my-bucket

# 删除文件
sealos s3 delete s3://my-bucket/file.txt
```

### 数据库管理

```bash
# 创建数据库
sealos database create postgres --name=my-db

# 查看连接信息
sealos database connection my-db

# 管理数据库
sealos database list
sealos database stop my-db
```

### 模板市场

```bash
# 浏览模板
sealos template list

# 使用模板创建项目
sealos template create nextjs --name=my-app
```

## 📖 常用命令

| 命令 | 说明 |
|------|------|
| `sealos login` | 登录到 Sealos 平台 |
| `sealos devbox create` | 创建开发环境 |
| `sealos devbox connect` | 连接到 IDE |
| `sealos s3 upload` | 上传文件到对象存储 |
| `sealos database create` | 创建数据库 |
| `sealos quota` | 查看资源配额 |
| `sealos template list` | 浏览可用模板 |

## ⚙️ 配置

创建配置文件 `.sealos/devbox.yaml`:

```yaml
name: my-project
template: nextjs
resources:
  cpu: 2c
  memory: 4g
ports:
  - 3000
env:
  NODE_ENV: development
```

## 📋 系统要求

- macOS 10.15+ / Linux / Windows (WSL2)
- 网络连接

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

Apache License 2.0

## 🔗 相关链接

- [官方文档](https://docs.sealos.io)
- [Sealos 云平台](https://sealos.io)
- [问题反馈](https://github.com/labring/sealos/issues)

---

**让云开发回归简单** ☁️