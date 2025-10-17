const mongoose = require('mongoose');
const { generateBSCWallet } = require('../dist/utils/index.js');
const User = require('../dist/model/user.model.js').default;
require('dotenv').config();

const dryRunMigration = async () => {
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
    }).select('_id username createdAt');

    console.log(`Found ${usersWithoutWallets.length} users without wallet addresses`);

    if (usersWithoutWallets.length === 0) {
      console.log('No users need wallet migration. All users already have wallet addresses!');
      return;
    }

    console.log('\n=== DRY RUN - No changes will be made ===');
    console.log('Users that would get wallet addresses:');
    console.log('==========================================');

    // Show first 10 users as examples
    const sampleUsers = usersWithoutWallets.slice(0, 10);
    
    for (let i = 0; i < sampleUsers.length; i++) {
      const user = sampleUsers[i];
      const wallet = generateBSCWallet();
      console.log(`${i + 1}. Username: ${user.username}`);
      console.log(`   Created: ${user.createdAt}`);
      console.log(`   Would get wallet: ${wallet.address}`);
      console.log('');
    }

    if (usersWithoutWallets.length > 10) {
      console.log(`... and ${usersWithoutWallets.length - 10} more users`);
    }

    console.log('\n=== Summary ===');
    console.log(`Total users that would be updated: ${usersWithoutWallets.length}`);
    console.log('This is a DRY RUN - no actual changes were made');
    console.log('');
    console.log('To run the actual migration:');
    console.log('1. Uncomment the migrateWallets() call in scripts/migrate-wallets.js');
    console.log('2. Run: yarn build && node scripts/migrate-wallets.js');

  } catch (error) {
    console.error('Dry run failed:', error);
    process.exit(1);
  } finally {
    // Close database connection
    await mongoose.disconnect();
    console.log('Database connection closed');
    process.exit(0);
  }
};

// Run dry run if this script is executed directly
if (require.main === module) {
  console.log('🔍 Starting DRY RUN for wallet migration...');
  console.log('This will show what would happen without making any changes');
  console.log('');
  dryRunMigration();
}

module.exports = dryRunMigration;
