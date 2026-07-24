#!/bin/bash
# Smart Poultry Test Runner
# Facilite l'exécution des tests IA

set -e

# Couleurs
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Smart Poultry - AI Test Suite         ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}\n"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Installing dependencies...${NC}"
    npm install
fi

# Parse command line arguments
TEST_TYPE=${1:-all}

case $TEST_TYPE in
    all)
        echo -e "${BLUE}🧪 Running all tests...${NC}\n"
        npm test
        ;;
    ai)
        echo -e "${BLUE}🤖 Running AI Service tests...${NC}\n"
        npm test -- test/aiService.test.js
        ;;
    integration)
        echo -e "${BLUE}🔗 Running Integration tests...${NC}\n"
        npm test -- test/aiIntegration.test.js
        ;;
    watch)
        echo -e "${BLUE}👀 Running tests in watch mode...${NC}\n"
        npm test -- --watch
        ;;
    coverage)
        echo -e "${BLUE}📊 Running tests with coverage...${NC}\n"
        npm test -- --coverage
        ;;
    *)
        echo -e "${YELLOW}Usage: ./run-tests.sh [all|ai|integration|watch|coverage]${NC}"
        exit 1
        ;;
esac

echo -e "\n${GREEN}  Tests completed!${NC}"
