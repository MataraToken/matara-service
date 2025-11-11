import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    walletAddress: {
      type: String,
      required: true,
      lowercase: true,
    },
    chain: {
      type: String,
      default: "BSC",
      enum: ["BSC", "ETH", "POLYGON"],
    },
    // Transaction type
    type: {
      type: String,
      enum: ["deposit", "withdrawal", "swap", "transfer", "approval", "other"],
      required: true,
    },
    // Transaction hash
    transactionHash: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    // Block information
    blockNumber: {
      type: Number,
    },
    blockHash: {
      type: String,
      lowercase: true,
    },
    // Transaction details
    from: {
      type: String,
      lowercase: true,
    },
    to: {
      type: String,
      lowercase: true,
    },
    // Token information (if applicable)
    tokenAddress: {
      type: String,
      lowercase: true,
    },
    tokenSymbol: {
      type: String,
    },
    // Amount information
    amount: {
      type: String, // Store as string for precision
    },
    amountFormatted: {
      type: String, // Human-readable format
    },
    // For swaps
    tokenIn: {
      type: String,
      lowercase: true,
    },
    tokenOut: {
      type: String,
      lowercase: true,
    },
    tokenInSymbol: {
      type: String,
    },
    tokenOutSymbol: {
      type: String,
    },
    amountIn: {
      type: String,
    },
    amountOut: {
      type: String,
    },
    // Gas information
    gasUsed: {
      type: String,
    },
    gasPrice: {
      type: String,
    },
    gasFee: {
      type: String, // Total gas fee in BNB
    },
    // Transaction status
    status: {
      type: String,
      enum: ["pending", "confirmed", "failed"],
      default: "pending",
    },
    // Confirmation count
    confirmations: {
      type: Number,
      default: 0,
    },
    // Timestamps
    transactionTimestamp: {
      type: Date, // Block timestamp
    },
    confirmedAt: {
      type: Date,
    },
    // Additional metadata
    metadata: {
      type: mongoose.Schema.Types.Mixed, // Store additional data as JSON
    },
    // Reference to related models
    swapRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SwapRequest",
    },
  },
  { timestamps: true }
);

// Indexes for faster queries
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ walletAddress: 1, createdAt: -1 });
transactionSchema.index({ transactionHash: 1 }, { unique: true });
transactionSchema.index({ type: 1, createdAt: -1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ chain: 1, blockNumber: -1 });

const Transaction = mongoose.model("Transaction", transactionSchema);

export default Transaction;

