# Authentication API Documentation

This document describes the authentication endpoints for the Matara service.

## Base URL
```
/api/auth
```

## Endpoints

### 1. Check Password Status
**GET** `/api/auth/check-password?username={username}`

Check if a user has a password set.

**Query Parameters:**
- `username` (string, required): The username to check

**Response:**
```json
{
  "hasPassword": false,
  "message": "User needs to create password"
}
```

### 2. Create Password
**POST** `/api/auth/create-password`

Create a password for a user who doesn't have one yet.

**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "token": "jwt_token_here",
  "message": "Password created successfully"
}
```

**Error Responses:**
- `400` - Username and password are required
- `404` - User not found
- `400` - User already has a password set

### 3. Login
**POST** `/api/auth/login`

Login with username and password to get a JWT token.

**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "token": "jwt_token_here",
  "message": "Login successful"
}
```

**Error Responses:**
- `400` - Username and password are required
- `404` - User not found
- `400` - User has not set a password yet
- `401` - Invalid credentials

### 4. Verify Token
**GET** `/api/auth/verify-token`

Verify a JWT token and get user information.

**Headers:**
```
Authorization: Bearer {token}
```

**Response:**
```json
{
  "message": "Token is valid",
  "user": {
    "id": "user_id",
    "username": "username",
    "firstName": "First Name",
    "walletAddress": "0x...",
    "isAdmin": false
  }
}
```

**Error Responses:**
- `401` - No token provided
- `401` - Invalid token
- `401` - User not found

## Frontend Integration Flow

### 1. App Load Check
```javascript
// Check if user has password
const response = await fetch('/api/auth/check-password?username=user123');
const data = await response.json();

if (data.hasPassword) {
  // Show login form
  showLoginForm();
} else {
  // Show create password form
  showCreatePasswordForm();
}
```

### 2. Create Password
```javascript
const response = await fetch('/api/auth/create-password', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    username: 'user123', 
    password: 'userpassword' 
  })
});
```

### 3. Login
```javascript
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    username: 'user123', 
    password: 'userpassword' 
  })
});

const data = await response.json();
if (data.token) {
  // Store token for future requests
  localStorage.setItem('token', data.token);
  // Redirect to main app
}
```

### 4. Protected Requests
```javascript
// Use token in Authorization header
const response = await fetch('/api/protected-endpoint', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  }
});
```

## Security Features

- Passwords are hashed using bcrypt with salt rounds of 10
- JWT tokens expire after 24 hours
- Tokens include user ID, username, and admin status
- Password field is excluded from user queries by default
- Authentication middleware available for protecting routes

## Environment Variables

Make sure to set:
```bash
JWT_SECRET=your-secret-key-here
```

## Middleware Usage

To protect routes, use the `authenticateToken` middleware:

```typescript
import { authenticateToken } from '../middleware/auth';

router.get('/protected-route', authenticateToken, (req, res) => {
  // req.user contains user information
  res.json({ user: req.user });
});
```
