const express = require('express');
const multer = require('multer');
const Redis = require('ioredis');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
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

const QUEUE_NAME = 'conversion_tasks';
const TASK_PREFIX = 'task:';
const TASK_TIMEOUT = 30 * 60 * 1000;

app.post('/api/upload', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const taskId = uuidv4();
    const { targetFormat, preprocess = true } = req.body;

    if (!targetFormat) {
      return res.status(400).json({ error: 'Target format is required' });
    }

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
      maxRetries: 3
    };

    await redis.setex(`${TASK_PREFIX}${taskId}`, TASK_TIMEOUT / 1000, JSON.stringify(task));
    await redis.lpush(QUEUE_NAME, taskId);

    res.json({ taskId, status: 'queued' });
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
