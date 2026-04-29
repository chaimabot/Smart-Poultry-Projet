# Fix "Densité not allowed" - Progress Tracker

## ✅ Plan Approved
- [x] User approved the fix plan

## 🔧 File Edits (3/4)
- [x] Edit `backend/models/Poulailler.js` - Fix mongoose schema (min:0 rejects null)
- [x] Edit `mobile/src/features/poultry/screens/AddPoultryScreen.js` - Remove densite from API payload
- [ ] Edit `backend/controllers/poulaillersController.js` - Defensive: delete densite from input
- [ ] Verify no regressions in authController.js

## 🧪 Testing
- [ ] Backend API test: Create poulailler with null/valid densite
- [ ] Frontend test: Mobile form submission (new/edit)
- [ ] Restart backend server
- [ ] Full validation pass

## ✅ Completion
- [ ] attempt_completion

*Updated: $(date)
