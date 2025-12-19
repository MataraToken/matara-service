# Security Enhancements Documentation

This document outlines the security enhancements implemented for the Matara wallet management service.

## Overview

The service manages user wallets and handles sensitive operations including:
- Wallet creation and private key encryption
- Token transfers (internal and external)
- Token swaps
- User authentication

## Security Features Implemented

### 1. Encryption Improvements

**Issue Fixed**: Previously used hardcoded salt 'salt' for all wallet encryptions.

**Solution**: 
- Each wallet now uses a unique, randomly generated salt (32 bytes)
- Salt is stored with the encrypted data in format: `salt:iv:authTag:encrypted`
- Backward compatibility maintained for existing wallets
- Minimum password length enforced (16 characters)

**Files Modified**:
- `src/utils/index.ts` - Enhanced `encryptPrivateKey` and `decryptPrivateKey` functions

### 2. Rate Limiting

Multiple rate limiters implemented to prevent abuse:

- **General API**: 100 requests per 15 minutes per IP
- **Authentication**: 5 attempts per 15 minutes per IP
- **Wallet Operations**: 10 operations per hour per IP
- **Transfers**: 20 transfers per hour per IP
- **Swaps**: 30 swaps per hour per IP

**Files Created**:
- `src/middleware/security.ts` - Contains all rate limiting middleware

### 3. Security Headers

Helmet.js configured to add security headers:
- Content Security Policy
- HSTS (HTTP Strict Transport Security)
- XSS Protection
- Frame Guard (prevents clickjacking)
- No Sniff (prevents MIME type sniffing)

**Implementation**: Applied globally in `src/index.ts`

### 4. Input Validation & Sanitization

- Express-validator used for input validation
- Custom validators for wallet addresses, token addresses, amounts
- Input sanitization middleware removes potentially dangerous content
- Validation error handling middleware

**Validators**:
- `validateWalletAddress` - Validates Ethereum/BSC address format
- `validateTokenAddress` - Validates token addresses or native indicators
- `validateAmount` - Ensures positive numbers within reasonable limits
- `validateUsername` - Validates username format and length

### 5. Audit Logging

Comprehensive audit logging for security-sensitive operations:

- **Wallet Operations**: All transfers, swaps, and wallet access
- **Authentication Events**: Login attempts (successful and failed)
- **Admin Operations**: All admin actions
- **Suspicious Activities**: Rate limit violations, transaction limit violations

**Log Files**:
- `logs/combined.log` - All logs
- `logs/error.log` - Error logs only
- `logs/audit.log` - Security audit logs (retained longer)

**Files Created**:
- `src/services/audit.service.ts` - Audit logging service

### 6. Authentication & Authorization

**Enhanced**:
- All transfer endpoints now require user authentication
- All swap endpoints require authentication
- JWT token validation with user existence check
- Admin middleware verifies admin status for admin-only operations

**Files Modified**:
- `src/routes/transfer.route.ts` - Added authentication
- `src/routes/swap.route.ts` - Added authentication
- `src/routes/auth.route.ts` - Added rate limiting

### 7. Transaction Limits

Per-user transaction limits to prevent abuse:

- **Max per transaction**: Configurable via `MAX_AMOUNT_PER_TRANSACTION` (default: 1000)
- **Max per day**: Configurable via `MAX_AMOUNT_PER_DAY` (default: 10000)
- **Max transactions per day**: Configurable via `MAX_TRANSACTIONS_PER_DAY` (default: 50)

**Files Created**:
- `src/middleware/transaction-limits.ts` - Transaction limit checking middleware

### 8. Environment Variable Validation

Startup validation ensures:
- All required environment variables are set
- Security-sensitive variables meet strength requirements
- No default/example values in production

**Requirements**:
- `JWT_SECRET`: Minimum 32 characters, not "secret" or "default-secret"
- `WALLET_ENCRYPTION_PASSWORD`: Minimum 16 characters, not "default-encryption-key" or "password"
- `BSC_RPC_URL`: Valid URL format
- `SYSTEM_WALLET_ADDRESS`: Valid Ethereum/BSC address format (if provided)

**Files Created**:
- `src/utils/env-validator.ts` - Environment validation utilities

### 9. IP Whitelisting (Optional)

Admin operations can be restricted to specific IP addresses:

- Configure via `ADMIN_IP_WHITELIST` environment variable (comma-separated)
- Only enforced in production
- Disabled in development for easier testing

**Example**: `ADMIN_IP_WHITELIST=192.168.1.100,10.0.0.50`

### 10. Request Timeout

30-second timeout on all requests to prevent resource exhaustion.

### 11. Error Handling

- Generic error messages to prevent information leakage
- Detailed errors logged server-side only
- No sensitive data in error responses

## Environment Variables

### Required

```bash
MONGO_URL=<mongodb-connection-string>
JWT_SECRET=<at-least-32-characters-strong-secret>
WALLET_ENCRYPTION_PASSWORD=<at-least-16-characters-strong-password>
TELEGRAM_BOT_TOKEN=<telegram-bot-token>
SERVER_URL=<server-url>
BOT_WEBHOOK_PATH=<webhook-path>
```

### Optional (Security)

```bash
# BSC Configuration
BSC_RPC_URL=https://bsc-dataseed1.binance.org/
SYSTEM_WALLET_ADDRESS=<system-wallet-address>
SYSTEM_ENCRYPTED_PRIVATE_KEY=<encrypted-private-key>

# Transaction Limits
MAX_AMOUNT_PER_TRANSACTION=1000
MAX_AMOUNT_PER_DAY=10000
MAX_TRANSACTIONS_PER_DAY=50

# Admin Security
ADMIN_IP_WHITELIST=<comma-separated-ip-addresses>

# Logging
LOG_LEVEL=info

# Gas Configuration
MIN_GAS_RESERVE_BNB=0.001
```

## Security Best Practices

1. **Never commit `.env` files** - Use environment variable management
2. **Use strong secrets** - Generate random, long strings for JWT_SECRET and WALLET_ENCRYPTION_PASSWORD
3. **Rotate secrets regularly** - Especially after security incidents
4. **Monitor audit logs** - Regularly review `logs/audit.log` for suspicious activity
5. **Keep dependencies updated** - Run `npm audit` regularly
6. **Use HTTPS in production** - Never expose the service over HTTP
7. **Restrict admin IPs** - Use `ADMIN_IP_WHITELIST` in production
8. **Set appropriate transaction limits** - Adjust based on your use case
9. **Monitor rate limit violations** - Check for brute force attempts
10. **Backup encrypted keys securely** - Ensure database backups are encrypted

## Migration Notes

### Existing Wallets

The encryption update maintains backward compatibility:
- Old format wallets (without salt) will continue to work
- New wallets use the enhanced encryption
- Consider re-encrypting old wallets for better security

### Breaking Changes

- Transfer endpoints now require authentication (admin only)
- Swap endpoints now require authentication
- Rate limiting may affect high-frequency operations
- Transaction limits may reject large transactions

## Monitoring & Alerts

Monitor the following:

1. **Audit Logs** (`logs/audit.log`):
   - Failed login attempts
   - Rate limit violations
   - Transaction limit violations
   - Suspicious activities

2. **Error Logs** (`logs/error.log`):
   - Encryption/decryption failures
   - Authentication errors
   - Transaction failures

3. **Application Metrics**:
   - Request rates
   - Response times
   - Error rates
   - Transaction volumes

## Incident Response

If a security incident is detected:

1. Review audit logs for the affected time period
2. Check for unauthorized access attempts
3. Rotate all secrets (JWT_SECRET, WALLET_ENCRYPTION_PASSWORD)
4. Review and update IP whitelists
5. Check for suspicious transactions
6. Consider temporarily disabling affected endpoints
7. Notify affected users if necessary

## Additional Recommendations

1. **Implement 2FA/MFA** for admin accounts
2. **Use Redis** for rate limiting in production (instead of in-memory)
3. **Implement request signing** for critical operations
4. **Add Web Application Firewall (WAF)**
5. **Regular security audits** and penetration testing
6. **Implement API key rotation** for external integrations
7. **Add anomaly detection** for unusual transaction patterns

## Support

For security concerns or questions, please review the codebase or contact the development team.

