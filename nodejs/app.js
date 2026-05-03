const express = require('express');
const multer = require('multer');
const Redis = require('ioredis');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined
});

const upload = multer({
  dest: process.env.UPLOAD_DIR || '../uploads',
  limits: { fileSize: parseInt(process.env.MAX_UPLOAD_SIZE) || 100 * 1024 * 1024 }
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const QUEUE_NAME = 'conversion_tasks';
const TASK_PREFIX = 'task:';
const MD5_PREFIX = 'md5:';
const TASK_TIMEOUT = 30 * 60 * 1000;
const AVG_CONVERSION_TIME = 30; // 平均转换时间（秒）

function calculateFileMD5(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function getQueuePosition() {
  const queueLength = await redis.llen(QUEUE_NAME);
  return queueLength;
}

function estimateWaitTime(queuePosition) {
  const maxConcurrent = parseInt(process.env.MAX_CONCURRENT || '2');
  const estimatedSeconds = Math.ceil(queuePosition / maxConcurrent) * AVG_CONVERSION_TIME;
  
  if (estimatedSeconds < 60) {
    return `${estimatedSeconds}秒`;
  }
  const minutes = Math.ceil(estimatedSeconds / 60);
  return `${minutes}分钟`;
}

app.post('/api/upload', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { targetFormat, preprocess = true } = req.body;

    if (!targetFormat) {
      return res.status(400).json({ error: 'Target format is required' });
    }

    const fileMD5 = await calculateFileMD5(req.file.path);
    const md5Key = `${MD5_PREFIX}${fileMD5}:${targetFormat}`;
    
    const existingTaskId = await redis.get(md5Key);
    
    if (existingTaskId) {
      const existingTaskData = await redis.get(`${TASK_PREFIX}${existingTaskId}`);
      if (existingTaskData) {
        const existingTask = JSON.parse(existingTaskData);
        if (['queued', 'processing'].includes(existingTask.status)) {
          fs.unlinkSync(req.file.path);
          const queuePos = await getQueuePosition();
          return res.json({
            taskId: existingTaskId,
            status: existingTask.status,
            isDuplicate: true,
            message: '相同文件已有任务在处理中',
            queuePosition: existingTask.status === 'queued' ? queuePos : 0,
            estimatedWaitTime: existingTask.status === 'queued' ? estimateWaitTime(queuePos) : '正在处理中'
          });
        }
      }
    }

    const taskId = uuidv4();
    const task = {
      id: taskId,
      status: 'queued',
      originalFile: req.file.filename,
      originalName: req.file.originalname,
      originalPath: req.file.path,
      targetFormat: targetFormat,
      preprocess: preprocess === 'true',
      progress: 0,
      createdAt: Date.now(),
      retries: 0,
      maxRetries: 3,
      fileMD5: fileMD5
    };

    await redis.setex(`${TASK_PREFIX}${taskId}`, TASK_TIMEOUT / 1000, JSON.stringify(task));
    await redis.setex(md5Key, TASK_TIMEOUT / 1000, taskId);
    await redis.lpush(QUEUE_NAME, taskId);
    
    const queuePosition = await getQueuePosition();
    const estimatedWaitTime = estimateWaitTime(queuePosition);

    res.json({ 
      taskId, 
      status: 'queued',
      isDuplicate: false,
      queuePosition: queuePosition,
      estimatedWaitTime: estimatedWaitTime,
      message: `任务已提交，当前排队第 ${queuePosition} 位，预计等待 ${estimatedWaitTime}`
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

app.get('/api/task/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const taskData = await redis.get(`${TASK_PREFIX}${taskId}`);

    if (!taskData) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json(JSON.parse(taskData));
  } catch (error) {
    console.error('Query error:', error);
    res.status(500).json({ error: 'Query failed' });
  }
});

app.get('/api/download/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const taskData = await redis.get(`${TASK_PREFIX}${taskId}`);

    if (!taskData) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = JSON.parse(taskData);

    if (task.status !== 'completed') {
      return res.status(400).json({ error: 'Task not completed yet' });
    }

    const convertedPath = path.join(process.env.CONVERTED_DIR || '../converted', task.convertedFile);

    if (!fs.existsSync(convertedPath)) {
      return res.status(404).json({ error: 'Converted file not found' });
    }

    res.download(convertedPath, task.convertedName);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Download failed' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Node.js service running on port ${PORT}`);
});
