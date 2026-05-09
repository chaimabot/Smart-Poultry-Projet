# TODO - Fix POST /api/lampe/:id/control 404

## Plan approuvé :

1. [x] ✅ Renommé `backend/controllers/lampeController.js` → `backend/controllers/LampeController.js` _(confirmé list_files)_
2. [x] ✅ Git stage rename (Windows cache)
3. [x] ✅ git commit/push - fix lampe controller casing
4. [x] ✅ Tested locally - server logs confirm lampe routes loaded/mounted ✓

## Status Git (à vérifier):

Untracked: TODO.md
Modified: mobile files
Backend rename: force add

## Test après restart/deploy:

curl -X POST 'http://localhost:5000/api/lampe/69f27e9b62b5f08c9bf125f9/control' \\
-H 'Authorization: Bearer TOKEN' \\
-H 'Content-Type: application/json' \\
-d '{\"mode\":\"manual\",\"action\":\"on\"}'

## Logs à vérifier:

[ROUTES] ✓ lampeRoutes loaded successfully
[ROUTES] Mounting /api/lampe ✓
