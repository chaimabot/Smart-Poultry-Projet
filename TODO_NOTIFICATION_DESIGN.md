# TODO - Mise à jour Notification Design

## Étapes à compléter:

- [x] 1. Analyser le fichier Notification.jsx existant
- [x] 2. Analyser le ThemeContext et DashboardScreen pour comprendre le design system
- [x] 3. Confirmer le plan avec l'utilisateur
- [ ] 4. Modifier Notification.jsx pour intégrer ThemeContext
- [ ] 5. Remplacer les couleurs statiques par les couleurs du thème
- [ ] 6. Refonte du header pour correspondre au design Dashboard
- [ ] 7. Tester l'affichage

## Détails des modifications:

1. Importations à ajouter:
   - useTheme depuis context/ThemeContext
   - useSafeAreaInsets depuis react-native-safe-area-context

2. State à modifier:
   - Ajouter const { darkMode, colors } = useTheme()

3. Remplacement des couleurs:
   - backgroundColor: #F8FAFC → colors.backgroundLight
   - card backgrounds → colors.cardLight
   - text colors → colors.textMainLight / colors.textSubLight
   - primary green: #22C55E → colors.primary
   - border colors → colors.borderLight / colors.borderDark
