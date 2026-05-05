# TODO - Fix POST /api/lampe/:id/control 404

## Plan approuvé :
1. [x] ✅ Renommé `backend/controllers/lampeController.js` → `backend/controllers/LampeController.js` *(confirmé list_files)*
2. [ ] Git stage rename (Windows cache)
3. [ ] `git commit -m \"fix: lampe controller casing for prod\" & git push`
4. [ ] Render deploy → test mobile https://smart-poultry-projet.onrender.com

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
