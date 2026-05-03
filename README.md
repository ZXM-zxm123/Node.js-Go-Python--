# 文档转换系统

基于 Node.js、Go、Python 构建的分布式文档转换系统。

## 架构
- **Node.js (Express)**: 接收上传、任务队列管理、进度查询、下载
- **Go**: 从队列获取任务、调用 Pandoc 转换、并发控制
- **Python**: 文档预处理 (Word 元数据清理、Markdown 标准化)
- **Redis**: 任务队列和状态存储

## 功能特性
- 多格式转换 (PDF、DOCX、HTML、Markdown等)
- 任务队列和进度查询
- 超时控制
- 失败重试 (最多3次)
- 并发数限制
- 文档预处理

## 快速开始

### 前置要求
- Node.js 18+
- Go 1.21+
- Python 3.9+
- Redis
- Pandoc

### 启动服务

Windows:
```powershell
.\start.ps1
```

手动启动:
```bash
# Node.js
cd nodejs
npm install
npm start

# Go
cd go
go mod tidy
go run main.go

# Python
cd python
pip install -r requirements.txt
python app.py
```

## 使用示例

### 上传并转换文档
```bash
curl -X POST -F "document=@test.docx" -F "targetFormat=pdf" http://localhost:3000/api/upload
```

### 查询任务状态
```bash
curl http://localhost:3000/api/task/{taskId}
```

### 下载转换结果
```bash
curl -OJ http://localhost:3000/api/download/{taskId}
```
