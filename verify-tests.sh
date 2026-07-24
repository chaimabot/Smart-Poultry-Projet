#!/bin/bash
# Test Setup Verification Script
# Vérifie que tout est en place pour exécuter les tests

set -e

# Couleurs
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Smart Poultry - Test Setup Verification          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}\n"

# Counter
passed=0
failed=0

# Check 1: Package.json exists
echo -n "📦 Vérification package.json... "
if [ -f "package.json" ]; then
    echo -e "${GREEN}✓${NC}"
    ((passed++))
else
    echo -e "${RED}✗${NC} Fichier package.json manquant"
    ((failed++))
fi

# Check 2: Jest installed
echo -n "🧪 Vérification Jest... "
if grep -q '"jest"' package.json; then
    echo -e "${GREEN}✓${NC}"
    ((passed++))
else
    echo -e "${YELLOW}⚠${NC} Jest non listé dans package.json"
    ((failed++))
fi

# Check 3: Test directory exists
echo -n "📁 Vérification répertoire test/... "
if [ -d "test" ]; then
    echo -e "${GREEN}✓${NC}"
    ((passed++))
else
    echo -e "${RED}✗${NC} Répertoire test/ manquant"
    ((failed++))
fi

# Check 4: Test files exist
echo -n "📄 Vérification fichiers de test... "
if [ -f "test/aiService.test.js" ] && [ -f "test/aiIntegration.test.js" ]; then
    echo -e "${GREEN}✓${NC}"
    ((passed++))
else
    echo -e "${RED}✗${NC} Fichiers de test manquants"
    ((failed++))
fi

# Check 5: jest.config.js exists
echo -n "⚙️  Vérification jest.config.js... "
if [ -f "jest.config.js" ]; then
    echo -e "${GREEN}✓${NC}"
    ((passed++))
else
    echo -e "${RED}✗${NC} Fichier jest.config.js manquant"
    ((failed++))
fi

# Check 6: TEST.md exists
echo -n "📚 Vérification documentation TEST.md... "
if [ -f "TEST.md" ]; then
    echo -e "${GREEN}✓${NC}"
    ((passed++))
else
    echo -e "${RED}✗${NC} Fichier TEST.md manquant"
    ((failed++))
fi

# Check 7: node_modules exists
echo -n "📦 Vérification node_modules... "
if [ -d "node_modules" ]; then
    echo -e "${GREEN}✓${NC}"
    ((passed++))
else
    echo -e "${YELLOW}⚠${NC} node_modules manquant - npm install requis"
    ((failed++))
fi

# Check 8: Test script in package.json
echo -n "🔧 Vérification script 'test' en npm... "
if grep -q '"test"' package.json | grep -q 'jest'; then
    echo -e "${GREEN}✓${NC}"
    ((passed++))
else
    echo -e "${YELLOW}⚠${NC} Script 'test' non configuré"
    ((failed++))
fi

# Summary
echo ""
echo -e "${BLUE}═════════════════════════════════════════════════════${NC}"
echo -e "Résultats: ${GREEN}$passed✓${NC} / ${RED}$failed✗${NC}"
echo -e "${BLUE}═════════════════════════════════════════════════════${NC}\n"

if [ $failed -eq 0 ]; then
    echo -e "${GREEN}  Tout est en place!${NC}\n"
    echo "Vous pouvez maintenant exécuter:"
    echo -e "  ${BLUE}npm test${NC}                    # Tous les tests"
    echo -e "  ${BLUE}npm run test:coverage${NC}      # Avec couverture"
    echo -e "  ${BLUE}npm run test:watch${NC}         # Mode watch"
    exit 0
else
    echo -e "${RED}❌ Problèmes détectés${NC}\n"
    echo "Première étape:"
    echo -e "  ${YELLOW}npm install${NC}"
    exit 1
fi
