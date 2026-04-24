# TODO - Correction Erreurs 404/Network

## ✅ Analyse

- [x] Diagnostic des erreurs console frontend
- [x] Vérification des routes backend (app.js, routes/, controllers/)
- [x] Constat : serveur non démarré (ERR_CONNECTION_REFUSED port 5001)

## 🚀 Exécution

- [x] Installation des dépendances npm
- [x] Démarrer le serveur backend (npm start)
- [x] Tester les endpoints avec curl
- [x] Vérifier les logs serveur

## 🔍 Points à vérifier

1. **Port 5001** : backend écoute sur `process.env.PORT || 5001` ✅
2. **Routes modules** : `/api/admin/modules` existe ✅
3. **Routes alertes** : `/api/admin/alertes` existe ✅
4. **Controllers** : `getAllModules`, `claimModule`, `getAlertes` OK ✅

## 📌 Notes

- `ERR_CONNECTION_REFUSED` = serveur non accessible
- `404 Not Found` sur `/api/admin/modules` = serveur peut-être down ou autre processus sur 5001
- Après démarrage, vérifier que MongoDB est accessible
