#!/bin/bash

# HireCorrecto Restart Script - One-click restart
# This script cleanly stops all services and restarts them

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔄 Restarting HireCorrecto Interview Platform...${NC}"
echo ""

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT" || exit 1

# Function to kill process by PID
kill_process() {
    local pid=$1
    local name=$2
    if [ ! -z "$pid" ] && ps -p $pid > /dev/null 2>&1; then
        echo -e "${YELLOW}🔌 Stopping $name (PID: $pid)...${NC}"
        kill $pid 2>/dev/null || true
        sleep 1
        if ps -p $pid > /dev/null 2>&1; then
            echo -e "${YELLOW}🔌 Force stopping $name...${NC}"
            kill -9 $pid 2>/dev/null || true
        fi
    fi
}

# ============================================
# STEP 1: Stop all services
# ============================================
echo -e "${BLUE}🛑 Step 1: Stopping all services...${NC}"

# Stop using saved PID
if [ -f .app_pid ]; then
    APP_PID=$(cat .app_pid)
    kill_process $APP_PID "HireCorrecto"
    rm -f .app_pid
fi

# Kill all Node.js processes related to our app
echo -e "${YELLOW}🔌 Stopping Node.js processes...${NC}"
pkill -f "node.*server/index.js" 2>/dev/null || true
pkill -f "nodemon.*index.js" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
pkill -f "concurrently" 2>/dev/null || true

# Kill processes on our ports
echo -e "${YELLOW}🔌 Stopping processes on ports 5004 and 5173...${NC}"
lsof -ti:5004 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true

# Wait for processes to fully stop
echo -e "${YELLOW}⏳ Waiting for processes to stop...${NC}"
sleep 3

# Verify everything is stopped
REMAINING_PROCESSES=$(ps aux | grep -E "(node.*server|vite|nodemon|concurrently)" | grep -v grep | wc -l | tr -d ' ')
if [ "$REMAINING_PROCESSES" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Some processes may still be running, forcing stop...${NC}"
    pkill -9 -f "node.*server" 2>/dev/null || true
    pkill -9 -f "vite" 2>/dev/null || true
    pkill -9 -f "nodemon" 2>/dev/null || true
    sleep 2
else
    echo -e "${GREEN}✅ All processes stopped successfully!${NC}"
fi

echo ""

# ============================================
# STEP 2: Start all services
# ============================================
echo -e "${BLUE}🚀 Step 2: Starting all services...${NC}"

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ .env file not found.${NC}"
    echo -e "${YELLOW}📝 Creating .env file from template...${NC}"
    cp env.example .env
    echo -e "${YELLOW}⚠️  Please edit .env file with your configuration before running again.${NC}"
    exit 1
fi

# Load environment variables
export $(cat .env | grep -v '^#' | xargs)

# Quick validation
if [ -z "$MONGODB_URI" ]; then
    echo -e "${RED}❌ MONGODB_URI not set in .env file${NC}"
    exit 1
fi

if [ -z "$JWT_SECRET" ]; then
    echo -e "${RED}❌ JWT_SECRET not set in .env file${NC}"
    exit 1
fi

# Start the application
echo -e "${GREEN}🚀 Starting HireCorrecto...${NC}"

# Start in background
npm run start:all &
APP_PID=$!

# Wait for services to start
sleep 4

# Check if services started successfully
if ps -p $APP_PID > /dev/null 2>&1; then
    echo -e "${GREEN}✅ HireCorrecto restarted successfully!${NC}"
    echo ""
    echo -e "${BLUE}🌐 Frontend: http://localhost:5173${NC}"
    echo -e "${BLUE}🔧 Backend: http://localhost:5004${NC}"
    echo -e "${BLUE}📊 API Health: http://localhost:5004/api/health${NC}"
    echo ""
    echo -e "${YELLOW}💡 Default test accounts:${NC}"
    echo -e "${BLUE}   Recruiter: recruiter@hirecorrecto.com / Recruiter123${NC}"
    echo -e "${BLUE}   Candidate: candidate@hirecorrecto.com / Candidate123${NC}"
    echo ""
    echo -e "${YELLOW}🛑 To stop: Press Ctrl+C${NC}"
    
    # Save PID for stop script
    echo $APP_PID > .app_pid
    
    # Wait for the process (this will keep the script running)
    wait $APP_PID
else
    echo -e "${RED}❌ Failed to start HireCorrecto${NC}"
    exit 1
fi

