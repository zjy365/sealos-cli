# Sealos CLI 命令规范设计

基于您的需求，我为 Sealos CLI 设计了标准的命令结构：

## 1. 全局命令

```bash
# 版本信息
sealos version
sealos --version, -v

# 帮助信息
sealos --help, -h
sealos <command> --help

# 全局配置
sealos config set <key> <value>
sealos config get <key>
sealos config list
```

## 2. 认证模块

```bash
# 登录 - 唤起浏览器授权
sealos login [HOST]
sealos login hzh.sealos.run
sealos login --token <TOKEN>

# 登出
sealos logout

# 切换工作空间
sealos workspace switch <WORKSPACE_NAME>
sealos workspace list
sealos workspace current

# 查看当前用户信息
sealos whoami
```

## 3. Devbox 模块

```bash
# 创建 Devbox
sealos devbox create [PATH] [flags]
sealos devbox create /user/project/hello-world \
  --template=nextjs \
  --cpu=2c \
  --memory=4g \
  --name=my-devbox

# 连接 Devbox
sealos devbox connect <NAME> [flags]
sealos devbox connect my-devbox --ide=vscode
sealos devbox connect my-devbox --ide=cursor

# 管理 Devbox
sealos devbox list [flags]
sealos devbox get <NAME>
sealos devbox start <NAME>
sealos devbox stop <NAME>
sealos devbox restart <NAME>
sealos devbox delete <NAME> [--force]

# 发布 Devbox
sealos devbox publish <NAME> [flags]

# Devbox 模板管理
sealos devbox template build --name=<TEMPLATE_NAME> [flags]
sealos devbox template list
```

### Devbox 参数说明

```bash
Flags:
  --name string          Devbox 名称
  --template string      使用的模板 (default: "default")
  --cpu string          CPU 配置 (default: "1c")
  --memory string       内存配置 (default: "2g")
  --ide string          IDE 类型: vscode, cursor (default: "vscode")
  --port int            端口号 (default: 自动分配)
  --config string       配置文件路径
```

## 4. 对象存储 (S3) 模块

```bash
# 上传文件/目录
sealos s3 upload <SOURCE> [DESTINATION] [flags]
sealos s3 upload ./dist --bucket=my-bucket
sealos s3 upload ./file.txt s3://my-bucket/path/file.txt

# 下载文件
sealos s3 download <SOURCE> [DESTINATION] [flags]
sealos s3 download s3://my-bucket/file.txt ./local/

# 列出文件
sealos s3 list [PATH] [flags]
sealos s3 list
sealos s3 list --bucket=my-bucket
sealos s3 list s3://my-bucket/path/

# 删除文件
sealos s3 delete <PATH> [flags]
sealos s3 delete s3://my-bucket/file.txt
sealos s3 delete s3://my-bucket/path/ --recursive

# Bucket 管理
sealos s3 bucket create <BUCKET_NAME>
sealos s3 bucket list
sealos s3 bucket delete <BUCKET_NAME>

# 同步目录
sealos s3 sync <SOURCE> <DESTINATION> [flags]
sealos s3 sync ./dist s3://my-bucket/
```

### S3 参数说明

```bash
Flags:
  --bucket string       Bucket 名称
  --recursive, -r       递归操作
  --acl string          访问控制: private, public-read
  --region string       区域
  --force, -f           强制操作,不提示确认
```

## 5. 模板模块

```bash
# 列出可用模板（公开，无需认证）
sealos template list [-c category] [-o json|table]

# 查看模板详情（公开，无需认证）
sealos template get <NAME> [-o json|table]
sealos template describe <NAME>  # get 的别名

# 从模板目录部署（需认证）
sealos template deploy <TEMPLATE> --name <NAME> [--set KEY=VALUE ...]

# 从 raw YAML 部署（需认证）
sealos template deploy --file <path> [--set KEY=VALUE ...] [--dry-run]
sealos template deploy --yaml <string> [--set KEY=VALUE ...]
cat template.yaml | sealos template deploy [--dry-run]
```

### Template 参数说明

```bash
Flags:
  -c, --category string   按类别筛选
  -o, --output string     输出格式: json, table (default: "table")
  --name string           实例名称 (从目录部署时必填)
  --file string           模板 YAML 文件路径
  --yaml string           模板 YAML 字符串
  --set KEY=VALUE         设置模板参数，可多次使用
  --dry-run               仅校验，不创建资源
```

## 6. 数据库模块

```bash
# 创建数据库
sealos database create <TYPE> [flags]
sealos database create postgres --name=my-db --cpu=1c --memory=2g
sealos database create mysql --name=my-mysql --version=8.0

# 管理数据库
sealos database list
sealos database get <NAME>
sealos database start <NAME>
sealos database stop <NAME>
sealos database restart <NAME>
sealos database delete <NAME>

# 数据库连接信息
sealos database connection <NAME>
sealos database logs <NAME> [--follow]

# 备份和恢复
sealos database backup <NAME>
sealos database restore <NAME> --from=<BACKUP_ID>
```

### Database 参数说明

```bash
Flags:
  --name string         数据库名称
  --type string         数据库类型: postgres, mysql, mongodb, redis
  --version string      数据库版本
  --cpu string          CPU 配置
  --memory string       内存配置
  --storage string      存储大小 (default: "10Gi")
```

## 7. 资源配额模块

```bash
# 查看配额
sealos quota
sealos quota get
sealos quota show

# 查看资源使用情况
sealos quota usage
sealos quota usage --detailed

# 查看具体资源类型的配额
sealos quota get --resource=cpu
sealos quota get --resource=memory
sealos quota get --resource=storage
```

## 8. 应用管理模块

```bash
# 列出应用
sealos app list
sealos app get <NAME>

# 查看应用日志
sealos app logs <NAME> [flags]
sealos app logs <NAME> --follow --tail=100

# 应用操作
sealos app restart <NAME>
sealos app scale <NAME> --replicas=3
sealos app delete <NAME>
```

## 9. 配置文件支持

### 全局配置文件 `~/.sealos/config.yaml`

```yaml
current-context: hzh.sealos.run
contexts:
  - name: hzh.sealos.run
    host: https://hzh.sealos.run
    token: xxx
    workspace: default
```

### Devbox 配置文件 `.sealos/devbox.yaml`

```yaml
name: my-project
template: nextjs
resources:
  cpu: 2c
  memory: 4g
  storage: 20Gi
ports:
  - 3000
  - 8080
env:
  NODE_ENV: development
```

## 10. 输出格式

```bash
# 支持多种输出格式
sealos devbox list --output=json
sealos devbox list --output=yaml
sealos devbox list --output=table  # default
sealos devbox list -o json

# 筛选输出
sealos devbox list --selector=status=running
sealos devbox list --label=env=production
```

## 11. 常用命令示例

```bash
# 快速开始工作流
sealos login hzh.sealos.run
sealos devbox create . --template=nextjs
# 返回预览地址: https://xxx.hzh.sealos.run

# 管理开发环境
sealos devbox list
sealos devbox connect my-devbox --ide=cursor
sealos devbox stop my-devbox

# 静态网站部署
sealos s3 upload ./dist --bucket=my-website --acl=public-read

# 查看资源使用
sealos quota usage
sealos database list
```

## 12. 命令别名(可选)

```bash
# 简化常用命令
sealos db     -> sealos database
sealos dev    -> sealos devbox
sealos ws     -> sealos workspace
sealos tpl    -> sealos template
```

---

这个设计遵循了以下 CLI 最佳实践:

1. ✅ **一致的命名**: 动词-名词结构 (create, list, get, delete)
2. ✅ **层级清晰**: 使用子命令组织功能模块
3. ✅ **参数标准**: 长格式 `--flag`、短格式 `-f`
4. ✅ **帮助友好**: 每个命令都支持 `--help`
5. ✅ **配置文件**: 支持配置文件和环境变量
6. ✅ **输出灵活**: 支持多种输出格式
7. ✅ **错误处理**: 提供清晰的错误信息和建议
