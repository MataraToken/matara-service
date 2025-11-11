import mongoose from "mongoose";

const swapRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    walletAddress: {
      type: String,
      required: true,
    },
    chain: {
      type: String,
      default: "BSC",
      enum: ["BSC", "ETH", "POLYGON"],
    },
    tokenIn: {
      type: String,
      required: true,
      lowercase: true,
    },
    tokenOut: {
      type: String,
      required: true,
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
      required: true,
    },
    amountOut: {
      type: String,
    },
    amountOutMin: {
      type: String,
    },
    // Fee structure
    feePercentage: {
      type: Number,
      default: 0.5, // Default 0.5% fee
    },
    feeAmount: {
      type: String,
    },
    feeRecipientAddress: {
      type: String,
    },
    // Swap status
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed", "cancelled"],
      default: "pending",
    },
    // Transaction details
    transactionHash: {
      type: String,
    },
    // Additional metadata
    slippageTolerance: {
      type: Number,
      default: 0.5, // Default 0.5% slippage
    },
    deadline: {
      type: Number, // Unix timestamp
    },
    errorMessage: {
      type: String,
    },
    completedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

// Index for faster queries
swapRequestSchema.index({ userId: 1, createdAt: -1 });
swapRequestSchema.index({ status: 1 });
swapRequestSchema.index({ transactionHash: 1 }, { sparse: true });

const SwapRequest = mongoose.model("SwapRequest", swapRequestSchema);

export default SwapRequest;

