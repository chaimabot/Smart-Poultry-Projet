# TODO — Correction affichage données backend-admin dans Poulaillers.tsx

## Étape 1 : Backend — Enrichir `formatPoulaillerListItem` et `getPoulaillerById`

- [x] Ajouter `connectionStatus`, `alertSeverity`, `lastAlertDate`, `description`, `location`, `installationDate`
- [x] Mapper `seuils` → `thresholds` avec les bonnes clés
- [x] Mapper `autoThresholds` avec les bonnes clés
- [x] Mapper `actuatorStates` → `actuators` traduits
- [x] Inclure tous les capteurs dans `lastMeasure`

## Étape 2 : API JS — Corriger la route getUsers

- [x] `"/admin/eleveurs"` → `"/admin/poulaillers/users"`

## Étape 3 : Frontend — Adapter Poulaillers.tsx

- [x] Mettre à jour l'interface `PoulaillerAdmin`
- [x] Corriger l'affichage des capteurs (ne pas afficher 0 par défaut)
- [x] Corriger l'affichage des actionneurs avec données réelles
- [x] Gérer les valeurs null/undefined correctement

---

**Terminé** ✅
