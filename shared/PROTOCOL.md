# 文档转换系统 - 通信协议

## 1. 任务状态
- `queued`: 已加入队列
- `processing`: 处理中
- `completed`: 完成
- `failed`: 失败

## 2. Node.js API

### POST /api/upload
上传文档并创建转换任务

**请求:**
- Content-Type: multipart/form-data
- Body:
  - `document`: 文件
  - `targetFormat`: 目标格式 (pdf, docx, html, markdown等)
  - `preprocess`: 是否预处理 (true/false)

**响应:**
```json
{
  "taskId": "uuid",
  "status": "queued"
}
```

### GET /api/task/:taskId
查询任务状态

**响应:**
```json
{
  "id": "uuid",
  "status": "processing",
  "originalName": "document.docx",
  "targetFormat": "pdf",
  "progress": 50,
  "createdAt": 1234567890,
  "retries": 0,
  "maxRetries": 3
}
```

### GET /api/download/:taskId
下载转换后的文档

## 3. Python API

### POST /api/preprocess/word-metadata
清理 Word 文档元数据

**请求:**
```json
{
  "file_path": "/path/to/file.docx"
}
```

**响应:**
```json
{
  "status": "success",
  "message": "Metadata cleaned"
}
```

### POST /api/preprocess/markdown
标准化 Markdown 格式

## 4. Redis 数据结构

### 队列
- Key: `conversion_tasks`
- 类型: List
- 内容: task ID

### 任务数据
- Key: `task:{taskId}`
- 类型: String (JSON)
- TTL: 30 分钟
