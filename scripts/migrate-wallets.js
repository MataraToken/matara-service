const mongoose = require('mongoose');
const { generateBSCWallet, encryptPrivateKey } = require('../dist/utils/index.js');
const User = require('../dist/model/user.model.js').default;
require('dotenv').config();

const migrateWallets = async () => {
  try {
    // Connect to database
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGO_URL);
    console.log('Database connected successfully');

    // Find users without wallet addresses
    console.log('Finding users without wallet addresses...');
    const usersWithoutWallets = await User.find({ 
      $or: [
        { walletAddress: { $exists: false } },
        { walletAddress: null },
        { walletAddress: '' }
      ]
    }).select('_id username');

    console.log(`Found ${usersWithoutWallets.length} users without wallet addresses`);

    if (usersWithoutWallets.length === 0) {
      console.log('No users need wallet migration. Exiting...');
      return;
    }

    // Get encryption password
    const encryptionPassword = process.env.WALLET_ENCRYPTION_PASSWORD || 'default-encryption-key';
    console.log('Using encryption password:', encryptionPassword === 'default-encryption-key' ? 'DEFAULT (not recommended for production)' : 'CUSTOM');

    // Process users in batches to avoid memory issues
    const batchSize = 10;
    let processedCount = 0;
    let successCount = 0;
    let errorCount = 0;

    console.log(`Processing users in batches of ${batchSize}...`);

    for (let i = 0; i < usersWithoutWallets.length; i += batchSize) {
      const batch = usersWithoutWallets.slice(i, i + batchSize);
      
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(usersWithoutWallets.length / batchSize)} (${batch.length} users)`);

      for (const user of batch) {
        try {
          // Generate wallet for user
          const wallet = generateBSCWallet();
          const encryptedPrivateKey = encryptPrivateKey(wallet.privateKey, encryptionPassword);

          // Update user with wallet data
          await User.updateOne(
            { _id: user._id },
            {
              walletAddress: wallet.address,
              encryptedPrivateKey: encryptedPrivateKey
            }
          );

          console.log(`✅ Generated wallet for user: ${user.username} (${wallet.address})`);
          successCount++;
        } catch (error) {
          console.error(`❌ Error generating wallet for user ${user.username}:`, error);
          errorCount++;
        }
        
        processedCount++;
      }

      // Small delay between batches to avoid overwhelming the database
      if (i + batchSize < usersWithoutWallets.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log('\n=== Migration Summary ===');
    console.log(`Total users processed: ${processedCount}`);
    console.log(`Successful wallet generations: ${successCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log('Migration completed!');

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    // Close database connection
    await mongoose.disconnect();
    console.log('Database connection closed');
    process.exit(0);
  }
};

// Run migration if this script is executed directly
if (require.main === module) {
  console.log('🚀 Starting wallet migration for existing users...');
  console.log('⚠️  WARNING: This will generate wallets for all users without wallet addresses');
  console.log('⚠️  Make sure you have a backup of your database before running this script');
  console.log('⚠️  This script will NOT run automatically - you must execute it manually');
  console.log('');
  
  // Uncomment the line below to actually run the migration
  // migrateWallets();
  
  console.log('To run the migration, uncomment the migrateWallets() call in this script and run:');
  console.log('yarn build && node scripts/migrate-wallets.js');
}

module.exports = migrateWallets;
