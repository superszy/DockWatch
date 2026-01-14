# DockWatch

一个简单的单页Web服务，用于检查Docker容器镜像是否有更新。

## 功能特点

- 检查当前部署的所有容器（无论是否运行）
- 检测每个容器使用的镜像是否有更新
- 实时显示检查过程日志
- 列出所有需要更新的容器
- 显示每个镜像的最新更新时间
- 支持Docker Hub公共镜像检查

## 技术栈

- 后端：Node.js + Express + Dockerode
- 前端：HTML + CSS + JavaScript
- 部署：Docker + Docker Compose

## 部署方法

### 1. 克隆项目

```bash
git clone <repository-url>
cd dockwatch
```

### 2. 使用Docker Compose部署

```bash
docker-compose up -d
```

服务将在 `http://localhost:3100` 上运行。

### 3. 直接运行（开发模式）

```bash
# 安装依赖
npm install

# 启动服务
npm start
```

## 使用说明

1. 打开浏览器，访问 `http://localhost:3100`
2. 点击"开始检查"按钮
3. 在信息框中查看检查过程
4. 检查完成后，查看需要更新的容器列表

## 注意事项

1. 确保Docker服务正在运行
2. 该服务需要访问Docker套接字，因此在部署时会挂载 `/var/run/docker.sock`
3. 目前仅支持Docker Hub上的公共镜像检查
4. 对于私有镜像，需要额外的认证配置

## 项目结构

```
dockwatch/
├── public/
│   ├── index.html      # 前端页面
│   ├── styles.css      # 样式文件
│   └── script.js       # 前端脚本
├── server.js           # 后端服务
├── package.json        # 项目配置
├── Dockerfile          # Docker构建文件
├── docker-compose.yml  # Docker Compose配置
└── README.md           # 项目说明
```

## 工作原理

1. 前端通过AJAX调用后端API `/api/check-updates`
2. 后端使用Dockerode库获取所有容器信息
3. 对于每个容器，解析其使用的镜像名称
4. 调用Docker Hub API获取最新镜像信息
5. 比较本地镜像和远程镜像，判断是否需要更新
6. 返回结果给前端，前端展示检查结果

## 许可证

MIT
