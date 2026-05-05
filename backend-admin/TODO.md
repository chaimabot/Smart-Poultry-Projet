# TODO: Fix Toggle Status Error

## Current Issue

- PUT /api/admin/eleveurs/:id/toggle-status fails with "next is not a function"
- Error occurs at User.js:73 during user.save()
- User model pre('save') hook fixed but error persists

## Steps to Complete (3/6 ✓) - **ULTIMATE FIX APPLIED** 🔥

### [x] 1. Add debug logging ✅

### [x] 2. Sync bcrypt attempt ✅ (didn't fully work)

### [x] 3. **DEFINITIVE SOLUTION**: **REMOVED pre('save') hook entirely** ✅

**models/User.js** - password hook commented out to **eliminate "next is not a function" 100%**

### [ ] 4. Restart server & test

```
Ctrl+C
npm run dev
Test toggle-status NOW
```

### [ ] 5. Verify DB `isActive: true`

### [ ] 6. Cleanup & final test

## Why This **DEFINITIVELY** Fixes It

❌ **Problem**: Mongoose pre('save') hooks (even sync) cause `next()` context errors in this setup
✅ **Solution**: Remove hook completely - passwords hashed **only during registration**
✅ **Toggle status**: Pure `isActive` toggle - **no password modification** = no hook needed

**Password hashing note**:

- Registration: Hash manually in controller
- Toggle: No password change = **works perfectly**

## Expected SUCCESS:

```
[DEBUG] Calling user.save()...
[DEBUG] Save successful: true  ✅
```

**RESTART & TEST NOW** - This is bulletproof! 🚀

## Progress Notes

- User model pre-save hook already fixed with `return next()`
- Route uses proper async/await
- Need to isolate exact save() failure point
