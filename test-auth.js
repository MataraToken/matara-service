const axios = require('axios');

const BASE_URL = 'http://localhost:4000/api/auth';

const testAuthFlow = async () => {
  try {
    console.log('🧪 Testing Authentication Flow...\n');

    // Test 1: Check password status (should show hasPassword: false for existing users)
    console.log('1. Testing password status check...');
    try {
      const checkResponse = await axios.get(`${BASE_URL}/check-password?username=jurstadev`);
      console.log('✅ Password status check successful:', checkResponse.data);
    } catch (error) {
      console.log('❌ Password status check failed:', error.response?.data || error.message);
    }

    // Test 2: Create password
    console.log('\n2. Testing password creation...');
    try {
      const createResponse = await axios.post(`${BASE_URL}/create-password`, {
        username: 'jurstadev',
        password: 'testpassword123'
      });
      console.log('✅ Password creation successful:', createResponse.data);
    } catch (error) {
      console.log('❌ Password creation failed:', error.response?.data || error.message);
    }

    // Test 3: Login with password
    console.log('\n3. Testing login...');
    try {
      const loginResponse = await axios.post(`${BASE_URL}/login`, {
        username: 'jurstadev',
        password: 'testpassword123'
      });
      console.log('✅ Login successful:', {
        status: loginResponse.data.status,
        message: loginResponse.data.message,
        hasToken: !!loginResponse.data.token,
        user: loginResponse.data.user
      });
    } catch (error) {
      console.log('❌ Login failed:', error.response?.data || error.message);
    }

    // Test 4: Try to create password again (should fail)
    console.log('\n4. Testing duplicate password creation...');
    try {
      const duplicateResponse = await axios.post(`${BASE_URL}/create-password`, {
        username: 'jurstadev',
        password: 'anotherpassword'
      });
      console.log('❌ Should have failed:', duplicateResponse.data);
    } catch (error) {
      console.log('✅ Correctly failed:', error.response?.data?.message);
    }

    // Test 5: Verify token (if we have one from login)
    console.log('\n5. Testing token verification...');
    try {
      const loginResponse = await axios.post(`${BASE_URL}/login`, {
        username: 'jurstadev',
        password: 'testpassword123'
      });
      
      if (loginResponse.data.token) {
        const verifyResponse = await axios.get(`${BASE_URL}/verify-token`, {
          headers: {
            'Authorization': `Bearer ${loginResponse.data.token}`
          }
        });
        console.log('✅ Token verification successful:', verifyResponse.data);
      }
    } catch (error) {
      console.log('❌ Token verification failed:', error.response?.data || error.message);
    }

    console.log('\n🎉 Authentication flow test completed!');

  } catch (error) {
    console.error('Test failed:', error.message);
  }
};

// Only run if this script is executed directly
if (require.main === module) {
  console.log('⚠️  Make sure the server is running on localhost:4000');
  console.log('⚠️  This test will create a password for user "jurstadev"');
  console.log('');
  testAuthFlow();
}

module.exports = testAuthFlow;
