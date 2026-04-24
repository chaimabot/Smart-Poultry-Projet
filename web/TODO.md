# TODO - Simplification du formulaire d'ajout de module

## Étapes
- [x] Analyser le fichier Modules.tsx
- [x] Comprendre les dépendances (CreateModuleModal, handleCreate, types)
- [x] Rédiger le plan de modification
- [x] Plan approuvé par l'utilisateur
- [x] Modifier `CreateModuleModal` : supprimer les états `serialNumber`, `deviceName`, `firmwareVersion`
- [x] Modifier `CreateModuleModal` : supprimer les inputs de série, nom, firmware
- [x] Simplifier `canSubmit` (seulement `macValid`)
- [x] Simplifier le type `onCreate` → `{ macAddress: string }`
- [x] Mettre à jour `handleCreate` dans le composant principal
- [x] Mettre à jour le `useEffect` de réinitialisation
- [x] Mettre à jour le placeholder du champ de recherche
- [x] Tester la compilation — ✅ Aucune erreur TypeScript
