package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
)

type Task struct {
	ID            string `json:"id"`
	Status        string `json:"status"`
	OriginalFile  string `json:"originalFile"`
	OriginalName  string `json:"originalName"`
	OriginalPath  string `json:"originalPath"`
	TargetFormat  string `json:"targetFormat"`
	Preprocess    bool   `json:"preprocess"`
	Progress      int    `json:"progress"`
	CreatedAt     int64  `json:"createdAt"`
	Retries       int    `json:"retries"`
	MaxRetries    int    `json:"maxRetries"`
	ConvertedFile string `json:"convertedFile,omitempty"`
	ConvertedName string `json:"convertedName,omitempty"`
	Error         string `json:"error,omitempty"`
}

var (
	rdb          *redis.Client
	ctx          = context.Background()
	queueName    = "conversion_tasks"
	taskPrefix   = "task:"
	maxConcurrent int
	uploadDir     string
	convertedDir  string
)

func main() {
	_ = godotenv.Load()

	redisHost := getEnv("REDIS_HOST", "localhost")
	redisPort := getEnv("REDIS_PORT", "6379")
	redisPassword := getEnv("REDIS_PASSWORD", "")
	uploadDir = getEnv("UPLOAD_DIR", "../uploads")
	convertedDir = getEnv("CONVERTED_DIR", "../converted")
	maxConcurrent = parseInt(getEnv("MAX_CONCURRENT", "2"))
	timeout := parseInt(getEnv("CONVERSION_TIMEOUT", "300"))

	rdb = redis.NewClient(&redis.Options{
		Addr:     fmt.Sprintf("%s:%s", redisHost, redisPort),
		Password: redisPassword,
		DB:       0,
	})

	_, err := rdb.Ping(ctx).Result()
	if err != nil {
		log.Fatalf("Redis connection failed: %v", err)
	}

	log.Println("Go service started, waiting for tasks...")

	semaphore := make(chan struct{}, maxConcurrent)
	var wg sync.WaitGroup

	for {
		result, err := rdb.BRPop(ctx, 0*time.Second, queueName).Result()
		if err != nil {
			log.Printf("BRPop error: %v", err)
			time.Sleep(1 * time.Second)
			continue
		}

		taskID := result[1]

		semaphore <- struct{}{}
		wg.Add(1)

		go func(id string) {
			defer func() {
				<-semaphore
				wg.Done()
			}()

			processTask(id, time.Duration(timeout)*time.Second)
		}(taskID)
	}
}

func processTask(taskID string, timeout time.Duration) {
	ctxWithTimeout, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	taskData, err := rdb.Get(ctxWithTimeout, taskPrefix+taskID).Result()
	if err != nil {
		log.Printf("Task %s not found: %v", taskID, err)
		return
	}

	var task Task
	err = json.Unmarshal([]byte(taskData), &task)
	if err != nil {
		log.Printf("Task %s parse error: %v", taskID, err)
		return
	}

	task.Status = "processing"
	task.Progress = 10
	saveTask(&task)

	if task.Preprocess {
		err = preprocessDocument(&task)
		if err != nil {
			handleError(&task, fmt.Sprintf("Preprocessing failed: %v", err))
			return
		}
		task.Progress = 30
		saveTask(&task)
	}

	task.Progress = 50
	saveTask(&task)

	err = convertDocument(&task, ctxWithTimeout)
	if err != nil {
		handleError(&task, fmt.Sprintf("Conversion failed: %v", err))
		return
	}

	task.Status = "completed"
	task.Progress = 100
	saveTask(&task)

	log.Printf("Task %s completed successfully", taskID)
}

func preprocessDocument(task *Task) error {
	log.Printf("Preprocessing task %s", task.ID)
	return nil
}

func convertDocument(task *Task, ctx context.Context) error {
	log.Printf("Converting task %s to %s", task.ID, task.TargetFormat)

	inputPath := filepath.Join(uploadDir, task.OriginalFile)
	outputExt := strings.ToLower(task.TargetFormat)
	outputName := strings.TrimSuffix(task.OriginalName, filepath.Ext(task.OriginalName)) + "." + outputExt
	outputFile := task.ID + "." + outputExt
	outputPath := filepath.Join(convertedDir, outputFile)

	var cmd *exec.Cmd

	if outputExt == "pdf" || outputExt == "docx" || outputExt == "odt" {
		cmd = exec.CommandContext(ctx, "pandoc", inputPath, "-o", outputPath)
	} else {
		cmd = exec.CommandContext(ctx, "pandoc", inputPath, "-o", outputPath)
	}

	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%v: %s", err, string(output))
	}

	task.ConvertedFile = outputFile
	task.ConvertedName = outputName
	return nil
}

func handleError(task *Task, errMsg string) {
	task.Retries++
	task.Error = errMsg

	if task.Retries < task.MaxRetries {
		task.Status = "queued"
		saveTask(task)
		rdb.LPush(ctx, queueName, task.ID)
		log.Printf("Task %s failed, retrying (%d/%d)", task.ID, task.Retries, task.MaxRetries)
	} else {
		task.Status = "failed"
		saveTask(task)
		log.Printf("Task %s failed permanently: %s", task.ID, errMsg)
	}
}

func saveTask(task *Task) {
	data, _ := json.Marshal(task)
	ttl := 30 * 60 * time.Second
	rdb.Set(ctx, taskPrefix+task.ID, data, ttl)
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

func parseInt(s string) int {
	var i int
	fmt.Sscanf(s, "%d", &i)
	return i
}
