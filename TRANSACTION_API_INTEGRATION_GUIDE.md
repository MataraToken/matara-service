# Transaction Service - Frontend Integration Guide

This guide provides comprehensive documentation for integrating the transaction tracking service into your frontend application.

## Table of Contents
- [Overview](#overview)
- [Base URL](#base-url)
- [Authentication](#authentication)
- [API Endpoints](#api-endpoints)
- [Request/Response Examples](#requestresponse-examples)
- [Transaction Types](#transaction-types)
- [Transaction Status](#transaction-status)
- [Error Handling](#error-handling)
- [Integration Examples](#integration-examples)
- [Best Practices](#best-practices)

## Overview

The transaction service provides a complete transaction history system that:
- Automatically tracks all user transactions (deposits, withdrawals, swaps, transfers)
- Monitors blockchain for deposits in real-time
- Provides transaction statistics and analytics
- Supports filtering and pagination
- Tracks transaction status (pending, confirmed, failed)

**Note:** Transactions are automatically logged by the system when:
- Swaps are executed (via swap service)
- Deposits are detected (via deposit listener service)

## Base URL

```
Production: https://your-api-domain.com/api/transaction
Development: http://localhost:4000/api/transaction
```

## Authentication

Currently, transaction endpoints do not require authentication tokens. However, you must provide the `username` in query parameters to identify the user.

## API Endpoints

### 1. Get User Transactions

**Endpoint:** `GET /api/transaction/user?username={username}`

**Description:** Retrieves all transactions for a specific user with optional filtering and pagination.

**Query Parameters:**
- `username` (required): User's username
- `type` (optional): Filter by transaction type (`deposit`, `withdrawal`, `swap`, `transfer`, `approval`, `other`)
- `status` (optional): Filter by status (`pending`, `confirmed`, `failed`)
- `chain` (optional): Filter by blockchain (`BSC`, `ETH`, `POLYGON`)
- `limit` (optional): Number of results per page (default: 50, max: 100)
- `page` (optional): Page number (default: 1)

**Success Response (200):**
```typescript
{
  data: Array<{
    _id: string;
    userId: string;
    walletAddress: string;
    chain: "BSC" | "ETH" | "POLYGON";
    type: "deposit" | "withdrawal" | "swap" | "transfer" | "approval" | "other";
    transactionHash: string;
    blockNumber?: number;
    blockHash?: string;
    from?: string;
    to?: string;
    tokenAddress?: string;
    tokenSymbol?: string;
    amount?: string;
    amountFormatted?: string;
    // For swaps
    tokenIn?: string;
    tokenOut?: string;
    tokenInSymbol?: string;
    tokenOutSymbol?: string;
    amountIn?: string;
    amountOut?: string;
    // Gas information
    gasUsed?: string;
    gasPrice?: string;
    gasFee?: string;
    status: "pending" | "confirmed" | "failed";
    confirmations: number;
    transactionTimestamp?: string;
    confirmedAt?: string;
    metadata?: any;
    swapRequestId?: string;
    createdAt: string;
    updatedAt: string;
  }>;
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  message: "Transactions fetched successfully";
}
```

---

### 2. Get Transaction by Hash

**Endpoint:** `GET /api/transaction/hash/{transactionHash}`

**Description:** Retrieves a specific transaction by its blockchain transaction hash.

**Path Parameters:**
- `transactionHash`: The transaction hash (with or without 0x prefix)

**Success Response (200):**
```typescript
{
  data: {
    // Same structure as transaction object above
  };
  message: "Transaction fetched successfully";
}
```

---

### 3. Get Transactions by Wallet Address

**Endpoint:** `GET /api/transaction/wallet/{walletAddress}`

**Description:** Retrieves all transactions for a specific wallet address (useful for multi-user scenarios).

**Path Parameters:**
- `walletAddress`: The wallet address (with or without 0x prefix)

**Query Parameters:**
- `type` (optional): Filter by transaction type
- `status` (optional): Filter by status
- `limit` (optional): Number of results per page (default: 50)
- `page` (optional): Page number (default: 1)

**Success Response (200):**
```typescript
{
  data: Array<{
    // Transaction object with populated userId
    userId: {
      _id: string;
      username: string;
    };
    // ... rest of transaction fields
  }>;
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  message: "Transactions fetched successfully";
}
```

---

### 4. Get User Transaction Statistics

**Endpoint:** `GET /api/transaction/user/stats?username={username}`

**Description:** Retrieves transaction statistics and analytics for a user.

**Query Parameters:**
- `username` (required): User's username

**Success Response (200):**
```typescript
{
  data: {
    totalTransactions: number;
    byType: {
      deposits: number;
      withdrawals: number;
      swaps: number;
    };
    byStatus: {
      pending: number;
      confirmed: number;
      failed: number;
    };
    totalDeposits: string; // Total deposit amount (as string for precision)
  };
  message: "Transaction statistics fetched successfully";
}
```

---

## Request/Response Examples

### Example 1: Get All User Transactions

```typescript
// Request
const getUserTransactions = async (username: string) => {
  const response = await fetch(
    `http://localhost:4000/api/transaction/user?username=${username}`
  );
  
  const result = await response.json();
  return result.data;
};

// Response
{
  "data": [
    {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
      "userId": "65a1b2c3d4e5f6g7h8i9j0k2",
      "walletAddress": "0x1234567890123456789012345678901234567890",
      "chain": "BSC",
      "type": "deposit",
      "transactionHash": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      "blockNumber": 34567890,
      "blockHash": "0x...",
      "from": "0x9876543210987654321098765432109876543210",
      "to": "0x1234567890123456789012345678901234567890",
      "tokenAddress": "0x55d398326f99059fF775485246999027B3197955",
      "tokenSymbol": "USDT",
      "amount": "100000000000000000000",
      "amountFormatted": "100.0",
      "gasUsed": "21000",
      "gasPrice": "5000000000",
      "gasFee": "0.000105",
      "status": "confirmed",
      "confirmations": 12,
      "transactionTimestamp": "2024-01-15T10:30:00.000Z",
      "confirmedAt": "2024-01-15T10:30:05.000Z",
      "createdAt": "2024-01-15T10:30:05.000Z",
      "updatedAt": "2024-01-15T10:30:05.000Z"
    }
  ],
  "pagination": {
    "total": 150,
    "page": 1,
    "limit": 50,
    "totalPages": 3
  },
  "message": "Transactions fetched successfully"
}
```

### Example 2: Get Deposits Only

```typescript
// Request
const getDeposits = async (username: string) => {
  const response = await fetch(
    `http://localhost:4000/api/transaction/user?username=${username}&type=deposit&status=confirmed`
  );
  
  const result = await response.json();
  return result.data;
};
```

### Example 3: Get Transaction by Hash

```typescript
// Request
const getTransaction = async (txHash: string) => {
  const response = await fetch(
    `http://localhost:4000/api/transaction/hash/${txHash}`
  );
  
  const result = await response.json();
  return result.data;
};

// Usage
const tx = await getTransaction("0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890");
console.log(tx);
```

### Example 4: Get Transaction Statistics

```typescript
// Request
const getStats = async (username: string) => {
  const response = await fetch(
    `http://localhost:4000/api/transaction/user/stats?username=${username}`
  );
  
  const result = await response.json();
  return result.data;
};

// Response
{
  "data": {
    "totalTransactions": 45,
    "byType": {
      "deposits": 20,
      "withdrawals": 5,
      "swaps": 20
    },
    "byStatus": {
      "pending": 2,
      "confirmed": 42,
      "failed": 1
    },
    "totalDeposits": "1250.500000000000000000"
  }
}
```

### Example 5: Get Transactions with Pagination

```typescript
// Request - Get page 2 with 20 items per page
const getTransactionsPage = async (username: string, page: number = 1) => {
  const response = await fetch(
    `http://localhost:4000/api/transaction/user?username=${username}&limit=20&page=${page}`
  );
  
  const result = await response.json();
  return {
    transactions: result.data,
    pagination: result.pagination
  };
};
```

## Transaction Types

| Type | Description | Example |
|------|-------------|---------|
| `deposit` | Funds received into wallet | Token/BNB deposit |
| `withdrawal` | Funds sent from wallet | Token/BNB withdrawal |
| `swap` | Token swap executed | USDT → BNB swap |
| `transfer` | Token transfer | Sending tokens to another address |
| `approval` | Token approval | Approving DEX to spend tokens |
| `other` | Other transaction types | Custom transactions |

## Transaction Status

| Status | Description |
|--------|-------------|
| `pending` | Transaction is pending confirmation |
| `confirmed` | Transaction has been confirmed on blockchain |
| `failed` | Transaction failed or was reverted |

## Error Handling

### Common Error Scenarios

1. **User Not Found**
```json
{
  "message": "User not found"
}
```

2. **Transaction Not Found**
```json
{
  "message": "Transaction not found"
}
```

3. **Missing Username**
```json
{
  "message": "Username is required"
}
```

4. **Invalid Parameters**
```json
{
  "message": "Invalid transaction hash"
}
```

## Integration Examples

### React/TypeScript Example

```typescript
import { useState, useEffect } from 'react';

interface Transaction {
  _id: string;
  type: string;
  status: string;
  transactionHash: string;
  amountFormatted?: string;
  tokenSymbol?: string;
  createdAt: string;
}

const TransactionHistory = ({ username }: { username: string }) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  const fetchTransactions = async (page: number = 1, type?: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        username,
        page: page.toString(),
        limit: pagination.limit.toString(),
      });
      
      if (type) {
        params.append('type', type);
      }
      
      const response = await fetch(
        `http://localhost:4000/api/transaction/user?${params}`
      );
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch transactions');
      }
      
      setTransactions(data.data);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [username]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'text-green-500';
      case 'pending': return 'text-yellow-500';
      case 'failed': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  return (
    <div>
      <h2>Transaction History</h2>
      
      {/* Filter buttons */}
      <div className="filters">
        <button onClick={() => fetchTransactions(1)}>All</button>
        <button onClick={() => fetchTransactions(1, 'deposit')}>Deposits</button>
        <button onClick={() => fetchTransactions(1, 'swap')}>Swaps</button>
        <button onClick={() => fetchTransactions(1, 'withdrawal')}>Withdrawals</button>
      </div>
      
      {loading && <div>Loading...</div>}
      {error && <div className="error">{error}</div>}
      
      <div className="transactions">
        {transactions.map((tx) => (
          <div key={tx._id} className="transaction-item">
            <div className="transaction-header">
              <span className={`status ${getStatusColor(tx.status)}`}>
                {tx.status}
              </span>
              <span className="type">{tx.type}</span>
            </div>
            <div className="transaction-details">
              {tx.amountFormatted && (
                <div>
                  Amount: {tx.amountFormatted} {tx.tokenSymbol || 'BNB'}
                </div>
              )}
              <div>
                Hash: <a href={`https://bscscan.com/tx/${tx.transactionHash}`} target="_blank" rel="noopener noreferrer">
                  {tx.transactionHash.slice(0, 10)}...
                </a>
              </div>
              <div>Date: {formatDate(tx.createdAt)}</div>
            </div>
          </div>
        ))}
      </div>
      
      {/* Pagination */}
      <div className="pagination">
        <button 
          disabled={pagination.page === 1}
          onClick={() => fetchTransactions(pagination.page - 1)}
        >
          Previous
        </button>
        <span>
          Page {pagination.page} of {pagination.totalPages}
        </span>
        <button 
          disabled={pagination.page >= pagination.totalPages}
          onClick={() => fetchTransactions(pagination.page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
};
```

### Vue.js Example

```vue
<template>
  <div class="transaction-history">
    <h2>Transaction History</h2>
    
    <!-- Filters -->
    <div class="filters">
      <button @click="loadTransactions('all')">All</button>
      <button @click="loadTransactions('deposit')">Deposits</button>
      <button @click="loadTransactions('swap')">Swaps</button>
    </div>
    
    <!-- Loading state -->
    <div v-if="loading">Loading transactions...</div>
    
    <!-- Error state -->
    <div v-if="error" class="error">{{ error }}</div>
    
    <!-- Transactions list -->
    <div v-else class="transactions">
      <div 
        v-for="tx in transactions" 
        :key="tx._id" 
        class="transaction-item"
      >
        <div class="transaction-header">
          <span :class="['status', `status-${tx.status}`]">
            {{ tx.status }}
          </span>
          <span class="type">{{ tx.type }}</span>
        </div>
        <div class="transaction-details">
          <div v-if="tx.amountFormatted">
            {{ tx.amountFormatted }} {{ tx.tokenSymbol || 'BNB' }}
          </div>
          <div>
            <a 
              :href="`https://bscscan.com/tx/${tx.transactionHash}`"
              target="_blank"
            >
              View on BSCScan
            </a>
          </div>
          <div>{{ formatDate(tx.createdAt) }}</div>
        </div>
      </div>
    </div>
    
    <!-- Pagination -->
    <div class="pagination">
      <button 
        @click="changePage(pagination.page - 1)"
        :disabled="pagination.page === 1"
      >
        Previous
      </button>
      <span>Page {{ pagination.page }} of {{ pagination.totalPages }}</span>
      <button 
        @click="changePage(pagination.page + 1)"
        :disabled="pagination.page >= pagination.totalPages"
      >
        Next
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

const props = defineProps<{
  username: string;
}>();

const transactions = ref<any[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const pagination = ref({
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
});
const currentFilter = ref<string>('all');

const loadTransactions = async (type: string = 'all', page: number = 1) => {
  loading.value = true;
  error.value = null;
  currentFilter.value = type;
  
  try {
    const params = new URLSearchParams({
      username: props.username,
      page: page.toString(),
      limit: pagination.value.limit.toString(),
    });
    
    if (type !== 'all') {
      params.append('type', type);
    }
    
    const response = await fetch(
      `http://localhost:4000/api/transaction/user?${params}`
    );
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message);
    }
    
    transactions.value = data.data;
    pagination.value = data.pagination;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unknown error';
  } finally {
    loading.value = false;
  }
};

const changePage = (page: number) => {
  loadTransactions(currentFilter.value, page);
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleString();
};

onMounted(() => {
  loadTransactions();
});
</script>
```

### JavaScript/Node.js Example

```javascript
const axios = require('axios');

class TransactionService {
  constructor(baseURL) {
    this.baseURL = baseURL || 'http://localhost:4000/api/transaction';
  }

  /**
   * Get user transactions
   */
  async getUserTransactions(username, options = {}) {
    try {
      const params = {
        username,
        ...options,
      };
      
      const response = await axios.get(`${this.baseURL}/user`, { params });
      return response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(error.response.data.message);
      }
      throw error;
    }
  }

  /**
   * Get transaction by hash
   */
  async getTransactionByHash(transactionHash) {
    try {
      const response = await axios.get(
        `${this.baseURL}/hash/${transactionHash}`
      );
      return response.data.data;
    } catch (error) {
      if (error.response) {
        throw new Error(error.response.data.message);
      }
      throw error;
    }
  }

  /**
   * Get transactions by wallet address
   */
  async getTransactionsByWallet(walletAddress, options = {}) {
    try {
      const params = options;
      const response = await axios.get(
        `${this.baseURL}/wallet/${walletAddress}`,
        { params }
      );
      return response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(error.response.data.message);
      }
      throw error;
    }
  }

  /**
   * Get user transaction statistics
   */
  async getUserStats(username) {
    try {
      const response = await axios.get(`${this.baseURL}/user/stats`, {
        params: { username },
      });
      return response.data.data;
    } catch (error) {
      if (error.response) {
        throw new Error(error.response.data.message);
      }
      throw error;
    }
  }
}

// Usage
const transactionService = new TransactionService();

// Get all transactions
const transactions = await transactionService.getUserTransactions('john_doe');

// Get deposits only
const deposits = await transactionService.getUserTransactions('john_doe', {
  type: 'deposit',
  status: 'confirmed',
});

// Get transaction by hash
const tx = await transactionService.getTransactionByHash(
  '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
);

// Get statistics
const stats = await transactionService.getUserStats('john_doe');
console.log(`Total transactions: ${stats.totalTransactions}`);
console.log(`Total deposits: ${stats.totalDeposits}`);
```

## Best Practices

### 1. Implement Caching

Cache transaction data to reduce API calls:

```typescript
const transactionCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 30000; // 30 seconds

const getCachedTransactions = async (username: string, type?: string) => {
  const cacheKey = `${username}-${type || 'all'}`;
  const cached = transactionCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  
  const data = await fetchTransactions(username, type);
  transactionCache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
};
```

### 2. Real-time Updates

Poll for new transactions periodically:

```typescript
useEffect(() => {
  const interval = setInterval(() => {
    fetchTransactions();
  }, 30000); // Poll every 30 seconds
  
  return () => clearInterval(interval);
}, [username]);
```

### 3. Format Amounts

Always format amounts for display:

```typescript
const formatAmount = (amount: string, decimals: number = 18): string => {
  const num = parseFloat(amount);
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(2)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(2)}K`;
  }
  return num.toFixed(4);
};
```

### 4. Transaction Status Indicators

Provide visual feedback for transaction status:

```typescript
const getStatusIcon = (status: string) => {
  switch (status) {
    case 'confirmed':
      return '✓'; // Green checkmark
    case 'pending':
      return '⏳'; // Hourglass
    case 'failed':
      return '✗'; // Red X
    default:
      return '?';
  }
};
```

### 5. External Links

Link to blockchain explorers:

```typescript
const getExplorerUrl = (chain: string, txHash: string) => {
  const explorers = {
    BSC: `https://bscscan.com/tx/${txHash}`,
    ETH: `https://etherscan.io/tx/${txHash}`,
    POLYGON: `https://polygonscan.com/tx/${txHash}`,
  };
  return explorers[chain] || '#';
};
```

### 6. Error Handling

Implement comprehensive error handling:

```typescript
const fetchTransactions = async (username: string) => {
  try {
    const response = await fetch(
      `http://localhost:4000/api/transaction/user?username=${username}`
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message);
    }
    
    return await response.json();
  } catch (error) {
    if (error.message === 'User not found') {
      // Handle user not found
      showError('User not found');
    } else if (error.message.includes('network')) {
      // Handle network errors
      showError('Network error. Please check your connection.');
    } else {
      // Handle other errors
      showError('Failed to load transactions. Please try again.');
    }
    throw error;
  }
};
```

### 7. Loading States

Show appropriate loading indicators:

```typescript
const [loadingState, setLoadingState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

const fetchTransactions = async () => {
  setLoadingState('loading');
  try {
    const data = await fetchTransactions(username);
    setLoadingState('success');
    return data;
  } catch (error) {
    setLoadingState('error');
    throw error;
  }
};
```

### 8. Pagination UI

Implement user-friendly pagination:

```typescript
const Pagination = ({ pagination, onPageChange }) => {
  const pages = Array.from({ length: pagination.totalPages }, (_, i) => i + 1);
  
  return (
    <div className="pagination">
      <button 
        onClick={() => onPageChange(pagination.page - 1)}
        disabled={pagination.page === 1}
      >
        Previous
      </button>
      
      {pages.map(page => (
        <button
          key={page}
          onClick={() => onPageChange(page)}
          className={page === pagination.page ? 'active' : ''}
        >
          {page}
        </button>
      ))}
      
      <button 
        onClick={() => onPageChange(pagination.page + 1)}
        disabled={pagination.page >= pagination.totalPages}
      >
        Next
      </button>
    </div>
  );
};
```

## Transaction Data Structure

### Deposit Transaction
```json
{
  "type": "deposit",
  "tokenSymbol": "USDT",
  "amountFormatted": "100.0",
  "from": "0x...",
  "to": "0x...",
  "status": "confirmed"
}
```

### Swap Transaction
```json
{
  "type": "swap",
  "tokenInSymbol": "USDT",
  "tokenOutSymbol": "BNB",
  "amountIn": "100.0",
  "amountOut": "0.25",
  "status": "confirmed",
  "swapRequestId": "..."
}
```

### Withdrawal Transaction
```json
{
  "type": "withdrawal",
  "tokenSymbol": "BNB",
  "amountFormatted": "1.5",
  "from": "0x...",
  "to": "0x...",
  "status": "confirmed"
}
```

## Backfilling Historical Transactions

If you have transactions that were executed before the transaction service was implemented, you can backfill them using the admin endpoints.

### 1. Backfill Swap Transactions

**Endpoint:** `POST /api/transaction/admin/backfill/swaps`

**Description:** Backfills transaction records from existing completed swap requests.

**Authentication:** Requires admin token

**Request:**
```typescript
// Headers
Authorization: Bearer {admin_token}

// No body required
```

**Response:**
```json
{
  "message": "Swap transactions backfilled successfully",
  "data": {
    "successCount": 45,
    "skippedCount": 5,
    "errorCount": 0
  }
}
```

### 2. Backfill Wallet Transactions

**Endpoint:** `POST /api/transaction/admin/backfill/wallet/{walletAddress}`

**Description:** Scans the blockchain and backfills transactions for a specific wallet address.

**Authentication:** Requires admin token

**Query Parameters:**
- `startBlock` (optional): Starting block number (default: current block - 10000)
- `endBlock` (optional): Ending block number (default: current block)
- `maxTransactions` (optional): Maximum transactions to process (default: 1000)

**Example:**
```bash
POST /api/transaction/admin/backfill/wallet/0x1234...?startBlock=30000000&maxTransactions=500
```

**Response:**
```json
{
  "message": "Wallet transactions backfilled successfully",
  "data": {
    "createdCount": 120,
    "skippedCount": 30,
    "errorCount": 2,
    "processedCount": 152
  }
}
```

### 3. Backfill All Users

**Endpoint:** `POST /api/transaction/admin/backfill/all`

**Description:** Backfills transactions for all users with wallet addresses.

**Authentication:** Requires admin token

**Query Parameters:**
- `startBlock` (optional): Starting block number
- `endBlock` (optional): Ending block number
- `maxTransactionsPerUser` (optional): Max transactions per user (default: 100)

**Example:**
```bash
POST /api/transaction/admin/backfill/all?maxTransactionsPerUser=50
```

**Response:**
```json
{
  "message": "All user transactions backfilled successfully",
  "data": {
    "totalCreated": 1250,
    "totalSkipped": 350,
    "totalErrors": 5
  }
}
```

### Backfill Usage Example

```typescript
// Backfill swap transactions
const backfillSwaps = async () => {
  const response = await fetch('http://localhost:4000/api/transaction/admin/backfill/swaps', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
  });
  
  const result = await response.json();
  console.log(`Backfilled ${result.data.successCount} swap transactions`);
};

// Backfill specific wallet
const backfillWallet = async (walletAddress: string) => {
  const response = await fetch(
    `http://localhost:4000/api/transaction/admin/backfill/wallet/${walletAddress}?maxTransactions=200`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
    }
  );
  
  const result = await response.json();
  console.log(`Created ${result.data.createdCount} transactions`);
};
```

## Important Notes

1. **Automatic Tracking**: Transactions are automatically logged by the system - you don't need to create them manually
2. **Deposit Detection**: Deposits are detected automatically via the deposit listener service
3. **Swap Logging**: Swaps are automatically logged when executed via the swap service
4. **Historical Transactions**: Use backfill endpoints to import transactions from before the service was implemented
5. **Transaction Hash**: Always use the transaction hash to link to blockchain explorers
6. **Amount Precision**: Amounts are stored as strings to preserve precision
7. **Status Updates**: Transaction status updates automatically as confirmations increase
8. **Pagination**: Always use pagination for large transaction lists to improve performance
9. **Backfill Performance**: Backfilling scans the blockchain and may take time - use appropriate limits to avoid rate limits

## Support

For issues or questions, please contact the development team or refer to the API documentation.

---

**Last Updated:** January 2024  
**API Version:** 1.0

