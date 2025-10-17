# Wallet Migration Scripts

This directory contains scripts to migrate existing users to have BSC wallet addresses.

## Scripts Overview

### 1. `dry-run-wallets.js` - Safe Preview
**Purpose**: Shows what would happen without making any changes
**Usage**: 
```bash
yarn build && node scripts/dry-run-wallets.js
```
**What it does**:
- Connects to database
- Finds users without wallet addresses
- Shows sample of users that would be updated
- Generates example wallet addresses (but doesn't save them)
- **No database changes are made**

### 2. `migrate-wallets.js` - Actual Migration
**Purpose**: Generates and saves wallet addresses for users without them
**Usage**: 
```bash
# First, uncomment the migrateWallets() call in the script
# Then run:
yarn build && node scripts/migrate-wallets.js
```
**What it does**:
- Connects to database
- Finds users without wallet addresses
- Generates BSC wallets for each user
- Encrypts and stores private keys
- Updates users with wallet addresses
- **Makes actual database changes**

## Prerequisites

1. **Database Backup**: Always backup your database before running the migration
2. **Environment Variables**: Ensure `MONGO_URL` is set in your `.env` file
3. **Encryption Password**: Set `WALLET_ENCRYPTION_PASSWORD` in your `.env` file (recommended)

## Step-by-Step Migration Process

### Step 1: Preview the Migration
```bash
yarn build && node scripts/dry-run-wallets.js
```
This will show you:
- How many users need wallet addresses
- Sample of users that would be updated
- Example wallet addresses that would be generated

### Step 2: Backup Your Database
```bash
# Example MongoDB backup command
mongodump --uri="your-mongodb-connection-string" --out=./backup-$(date +%Y%m%d-%H%M%S)
```

### Step 3: Run the Migration
1. Open `scripts/migrate-wallets.js`
2. Find the line: `// migrateWallets();`
3. Uncomment it: `migrateWallets();`
4. Run the migration:
```bash
yarn build && node scripts/migrate-wallets.js
```

### Step 4: Verify the Migration
After running the migration, you can verify it worked by:
1. Checking your database for users with `walletAddress` fields
2. Running the dry-run script again (should show 0 users needing migration)
3. Testing user registration to ensure new users get wallets

## Safety Features

- **Batch Processing**: Users are processed in batches of 10 to avoid memory issues
- **Error Handling**: Individual user failures won't stop the entire migration
- **Progress Tracking**: Shows detailed progress and summary
- **Dry Run**: Preview changes before making them
- **Database Connection Management**: Properly opens and closes connections

## Environment Variables

```bash
# Required
MONGO_URL=mongodb://localhost:27017/your-database

# Recommended for production
WALLET_ENCRYPTION_PASSWORD=your-secure-encryption-password
```

## Troubleshooting

### Common Issues

1. **"Database connection failed"**
   - Check your `MONGO_URL` environment variable
   - Ensure MongoDB is running
   - Verify network connectivity

2. **"No users found"**
   - This is normal if all users already have wallet addresses
   - Check your database to see if users exist

3. **"Encryption errors"**
   - Ensure `WALLET_ENCRYPTION_PASSWORD` is set
   - Check that the password is consistent

### Recovery

If something goes wrong:
1. Restore from your database backup
2. Check the migration logs for specific errors
3. Run the dry-run script to verify current state
4. Contact support if needed

## Security Notes

- Private keys are encrypted using AES-256-GCM
- Encryption password should be strong and unique
- Never commit encryption passwords to version control
- Consider using environment-specific passwords
- Private keys are excluded from all user queries by default

## Post-Migration

After successful migration:
1. All existing users will have wallet addresses
2. New user registrations will automatically get wallets
3. User data responses will include wallet addresses
4. Private keys remain encrypted and secure
