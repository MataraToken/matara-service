# Breaking Changes - Security Enhancements

This document lists all changes that may affect existing functionality.

## ⚠️ CRITICAL BREAKING CHANGES

### 1. Transfer Endpoints Now Require Authentication

**Endpoints Affected:**
- `POST /api/transfer/user` 
- `POST /api/transfer/external`

**Before:** These endpoints were **public** (no authentication required)

**After:** These endpoints now require:
- ✅ Authentication token (Bearer token in Authorization header)
- ✅ User must be authenticated (no admin privileges required)

**Impact:** 
- ❌ **Any client calling these endpoints without authentication will receive 401 Unauthorized**

**Migration Required:**
```javascript
// Before (no auth needed)
fetch('/api/transfer/user', {
  method: 'POST',
  body: JSON.stringify({ username, tokenAddress, amount })
})

// After (auth required)
fetch('/api/transfer/user', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${userToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ username, tokenAddress, amount })
})
```

---

### 2. Swap Endpoints Now Require Authentication

**Endpoints Affected:**
- `POST /api/swap/` (create swap)
- `GET /api/swap/user` (get user swaps)
- `GET /api/swap/:swapRequestId` (get specific swap)

**Before:** These endpoints were **public** (no authentication required)

**After:** These endpoints now require:
- ✅ Authentication token (Bearer token in Authorization header)
- ✅ User must exist and be valid

**Impact:**
- ❌ **Any client calling these endpoints without authentication will receive 401 Unauthorized**

**Migration Required:**
```javascript
// Before (no auth needed)
fetch('/api/swap/', {
  method: 'POST',
  body: JSON.stringify({ username, tokenIn, tokenOut, amountIn })
})

// After (auth required)
fetch('/api/swap/', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${userToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ username, tokenIn, tokenOut, amountIn })
})
```

---

## ⚠️ POTENTIAL BREAKING CHANGES

### 3. Rate Limiting

**What Changed:**
- All endpoints now have rate limiting
- Different limits for different endpoint types

**Limits:**
- General API: 100 requests per 15 minutes per IP
- Authentication: 5 attempts per 15 minutes per IP
- Wallet Operations: 10 operations per hour per IP
- Transfers: 20 transfers per hour per IP
- Swaps: 30 swaps per hour per IP

**Impact:**
- ⚠️ **High-frequency operations may be blocked**
- ⚠️ **Multiple requests from same IP may hit limits**

**Error Response:**
```json
{
  "status": false,
  "message": "Too many requests from this IP, please try again later."
}
```

**Solution:**
- Adjust rate limits in `src/middleware/security.ts` if needed
- Use different IPs for high-frequency operations
- Implement request queuing on client side

---

### 4. Transaction Limits

**What Changed:**
- Per-user transaction limits are now enforced

**Default Limits:**
- Max per transaction: 1000 (configurable via `MAX_AMOUNT_PER_TRANSACTION`)
- Max per day: 10000 (configurable via `MAX_AMOUNT_PER_DAY`)
- Max transactions per day: 50 (configurable via `MAX_TRANSACTIONS_PER_DAY`)

**Impact:**
- ⚠️ **Large transactions may be rejected**
- ⚠️ **Users making many transactions may hit daily limits**

**Error Response:**
```json
{
  "status": false,
  "message": "Daily transaction limit exceeded. Maximum 50 transactions per day."
}
```

**Solution:**
- Set appropriate limits in environment variables
- Adjust limits based on your use case
- Remove limits for specific users if needed (modify middleware)

---

### 5. Input Validation

**What Changed:**
- Strict validation for wallet addresses, token addresses, amounts, usernames

**Validation Rules:**
- Wallet addresses: Must match `0x[a-fA-F0-9]{40}` format
- Token addresses: Must be valid address or native indicators
- Amounts: Must be positive numbers, max 1e18
- Usernames: 3-50 characters, alphanumeric + underscores only

**Impact:**
- ⚠️ **Previously accepted invalid inputs will now be rejected**
- ⚠️ **Edge cases may fail validation**

**Error Response:**
```json
{
  "status": false,
  "message": "Validation failed",
  "errors": [
    {
      "msg": "Invalid wallet address format",
      "param": "walletAddress"
    }
  ]
}
```

**Solution:**
- Review and fix any invalid inputs in your clients
- Update clients to validate inputs before sending

---

### 6. Environment Variable Validation

**What Changed:**
- Server validates environment variables on startup
- Rejects weak/default values in production

**Impact:**
- ⚠️ **Server may fail to start if:**
  - `JWT_SECRET` is less than 32 characters or is "secret"
  - `WALLET_ENCRYPTION_PASSWORD` is less than 16 characters or is "default-encryption-key"
  - Required variables are missing

**Error:**
```
❌ Environment validation failed:
  - JWT_SECRET must be at least 32 characters long
  - WALLET_ENCRYPTION_PASSWORD must not use default/example values
```

**Solution:**
- Set strong environment variables before deployment
- In development, warnings are shown but server continues

---

### 7. IP Whitelisting for Admin Operations

**What Changed:**
- Admin operations can be restricted to specific IPs (if `ADMIN_IP_WHITELIST` is set)

**Impact:**
- ⚠️ **Admin operations from non-whitelisted IPs will be blocked in production**

**Error Response:**
```json
{
  "status": false,
  "message": "Access denied: IP not whitelisted for admin operations"
}
```

**Solution:**
- Only set `ADMIN_IP_WHITELIST` if you want IP restrictions
- Leave it unset to allow all authenticated admins
- In development, IP whitelist is ignored

---

## ✅ NON-BREAKING CHANGES

### 8. Encryption Enhancement

**What Changed:**
- New wallets use per-wallet salts
- Old wallets continue to work (backward compatible)

**Impact:**
- ✅ **No breaking changes** - existing wallets still work
- ✅ **Better security** for new wallets

---

### 9. Audit Logging

**What Changed:**
- All security-sensitive operations are now logged

**Impact:**
- ✅ **No breaking changes** - purely additive
- ✅ **Better monitoring** and security tracking

---

### 10. Security Headers

**What Changed:**
- Security headers added to all responses

**Impact:**
- ✅ **No breaking changes** - improves security
- ⚠️ **May affect CORS** if frontend is on different domain (already configured)

---

## 📋 Migration Checklist

Before deploying, ensure:

- [ ] **Update all clients** calling transfer endpoints to include authentication
- [ ] **Update all clients** calling swap endpoints to include authentication
- [ ] **Set strong environment variables** (JWT_SECRET, WALLET_ENCRYPTION_PASSWORD)
- [ ] **Review rate limits** and adjust if needed for your use case
- [ ] **Set transaction limits** appropriate for your application
- [ ] **Test authentication flow** with existing clients
- [ ] **Monitor rate limit violations** after deployment
- [ ] **Review audit logs** for any issues
- [ ] **Update API documentation** to reflect authentication requirements
- [ ] **Notify users/clients** about authentication requirements

---

## 🔄 Rollback Plan

If you need to temporarily disable security features:

1. **Disable authentication on transfer endpoints:**
   - Remove `authenticateToken` and `isAdmin` from `src/routes/transfer.route.ts`

2. **Disable authentication on swap endpoints:**
   - Remove `authenticateToken` from `src/routes/swap.route.ts`

3. **Disable rate limiting:**
   - Comment out rate limiter middleware in routes

4. **Disable transaction limits:**
   - Remove `checkTransactionLimits` from routes

5. **Disable environment validation:**
   - Comment out validation in `src/index.ts`

**⚠️ WARNING:** Only do this for testing. Re-enable security features before production.

---

## 📞 Support

If you encounter issues:
1. Check audit logs in `logs/audit.log`
2. Check error logs in `logs/error.log`
3. Review rate limit violations
4. Verify environment variables are set correctly

