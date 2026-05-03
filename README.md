# Node.js-Go-Python--
使用 Node.js（Express）接收文档上传，将任务存入 Redis 队列，返回任务 ID。Go 服务从队列获取任务，调用 Pandoc（或 LibreOffice）进行格式转换，结果存至对象存储或本地。Python 服务提供预处理接口（如清理 Word 元数据、Markdown 标准化）。Node.js 提供进度查询和下载接口。实现转换超时控制、失败重试、并发数限制。输出 Node.js、Go、Python 三端代码及通信协议。
