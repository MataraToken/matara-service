const mongoose = require('mongoose');
const User = require('../dist/model/user.model.js').default;
require('dotenv').config();

const checkWalletStatus = async () => {
  try {
    // Connect to database
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGO_URL);
    console.log('Database connected successfully');

    // Get total user count
    const totalUsers = await User.countDocuments();
    console.log(`Total users in database: ${totalUsers}`);

    // Get users with wallet addresses
    const usersWithWallets = await User.countDocuments({ 
      walletAddress: { $exists: true, $ne: null, $ne: '' }
    });
    console.log(`Users with wallet addresses: ${usersWithWallets}`);

    // Get users without wallet addresses
    const usersWithoutWallets = await User.countDocuments({ 
      $or: [
        { walletAddress: { $exists: false } },
        { walletAddress: null },
        { walletAddress: '' }
      ]
    });
    console.log(`Users without wallet addresses: ${usersWithoutWallets}`);

    // Show percentage
    if (totalUsers > 0) {
      const percentage = ((usersWithWallets / totalUsers) * 100).toFixed(2);
      console.log(`Wallet coverage: ${percentage}%`);
    }

    // Show sample of users with wallets
    if (usersWithWallets > 0) {
      console.log('\nSample users with wallets:');
      const sampleUsers = await User.find({ 
        walletAddress: { $exists: true, $ne: null, $ne: '' }
      }).select('username walletAddress createdAt').limit(5);
      
      sampleUsers.forEach((user, index) => {
        console.log(`${index + 1}. ${user.username} - ${user.walletAddress} (created: ${user.createdAt})`);
      });
    }

    // Show sample of users without wallets
    if (usersWithoutWallets > 0) {
      console.log('\nSample users without wallets:');
      const sampleUsers = await User.find({ 
        $or: [
          { walletAddress: { $exists: false } },
          { walletAddress: null },
          { walletAddress: '' }
        ]
      }).select('username createdAt').limit(5);
      
      sampleUsers.forEach((user, index) => {
        console.log(`${index + 1}. ${user.username} (created: ${user.createdAt})`);
      });
    }

    console.log('\n=== Summary ===');
    if (usersWithoutWallets === 0) {
      console.log('✅ All users have wallet addresses!');
    } else {
      console.log(`⚠️  ${usersWithoutWallets} users need wallet addresses`);
      console.log('Run the migration script to generate wallets for these users');
    }

  } catch (error) {
    console.error('Check failed:', error);
    process.exit(1);
  } finally {
    // Close database connection
    await mongoose.disconnect();
    console.log('Database connection closed');
    process.exit(0);
  }
};

// Run check if this script is executed directly
if (require.main === module) {
  console.log('🔍 Checking wallet status for all users...');
  console.log('');
  checkWalletStatus();
}

module.exports = checkWalletStatus;
