# 启动脚本 - Windows PowerShell

Write-Host "启动文档转换系统..." -ForegroundColor Green

Write-Host "`n1. 启动 Redis (需要预先安装)" -ForegroundColor Yellow

Write-Host "`n2. 安装 Node.js 依赖..." -ForegroundColor Yellow
Set-Location nodejs
npm install
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm start"
Set-Location ..

Write-Host "`n3. 安装 Go 依赖..." -ForegroundColor Yellow
Set-Location go
go mod tidy
Start-Process powershell -ArgumentList "-NoExit", "-Command", "go run main.go"
Set-Location ..

Write-Host "`n4. 安装 Python 依赖..." -ForegroundColor Yellow
Set-Location python
pip install -r requirements.txt
Start-Process powershell -ArgumentList "-NoExit", "-Command", "python app.py"
Set-Location ..

Write-Host "`n系统已启动!" -ForegroundColor Green
Write-Host "Node.js: http://localhost:3000" -ForegroundColor Cyan
Write-Host "Python:  http://localhost:5000" -ForegroundColor Cyan
