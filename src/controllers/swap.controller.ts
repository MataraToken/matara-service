import { Request, Response } from "express";
import User from "../model/user.model";
import SwapRequest from "../model/swapRequest.model";
import mongoose from "mongoose";
import { executeBSCSwap, getSwapQuote } from "../utils/bscSwap";
import { createTransaction } from "../services/transaction.service";
import { ethers } from "ethers";

export const createSwapRequest = async (req: Request, res: Response) => {
  const {
    username,
    tokenIn,
    tokenOut,
    tokenInSymbol,
    tokenOutSymbol,
    amountIn,
    amountOut,
    amountOutMin,
    slippageTolerance,
    deadline,
  } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Validate required fields
    if (!username || !tokenIn || !tokenOut || !amountIn) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: "Username, tokenIn, tokenOut, and amountIn are required",
      });
    }

    // Find user and verify wallet address exists
    const user = await User.findOne({ username }).select("+encryptedPrivateKey").session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.walletAddress) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: "User wallet address not found. Please ensure wallet is set up.",
      });
    }

    if (!user.encryptedPrivateKey) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: "User encrypted private key not found. Cannot execute swap.",
      });
    }

    // Get fee configuration from environment or use defaults
    const feePercentage =
      parseFloat(process.env.SWAP_FEE_PERCENTAGE || "1.0") || 1.0;
    const feeRecipientAddress =
      process.env.FEE_RECIPIENT_ADDRESS || "";

    // Calculate fee amount
    const amountInNum = parseFloat(amountIn);
    if (isNaN(amountInNum) || amountInNum <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: "Invalid amountIn. Must be a positive number.",
      });
    }

    const feeAmount = (amountInNum * feePercentage) / 100;
    const feeAmountString = feeAmount.toFixed(18); // Use high precision for token amounts

    // Calculate deadline - since swap executes immediately, use a short deadline (5 minutes)
    // This protects against network delays while still allowing immediate execution
    // Deadline is required by PancakeSwap Router contract
    let swapDeadline = deadline || Math.floor(Date.now() / 1000) + 300; // Default 5 minutes
    
    // Validate deadline is not in the past and is reasonable (max 1 hour)
    const currentTime = Math.floor(Date.now() / 1000);
    const maxDeadline = currentTime + 3600; // Max 1 hour from now
    
    if (swapDeadline < currentTime) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: "Deadline cannot be in the past",
      });
    }
    
    if (swapDeadline > maxDeadline) {
      // Cap deadline at 1 hour for immediate swaps
      swapDeadline = maxDeadline;
    }
    
    const swapSlippage = slippageTolerance || 1.0;

    // Get swap quote to determine amountOutMin if not provided
    let calculatedAmountOutMin = amountOutMin;
    if (!calculatedAmountOutMin && amountOut) {
      // Calculate minimum based on slippage tolerance
      const amountOutNum = parseFloat(amountOut);
      calculatedAmountOutMin = (amountOutNum * (100 - swapSlippage) / 100).toFixed(18);
    } else if (!calculatedAmountOutMin) {
      // Try to get quote from PancakeSwap
      try {
        const quote = await getSwapQuote(tokenIn, tokenOut, amountIn);
        const quoteAmountOut = parseFloat(quote.amountOut);
        calculatedAmountOutMin = (quoteAmountOut * (100 - swapSlippage) / 100).toFixed(18);
      } catch (quoteError) {
        console.warn('Could not get swap quote, proceeding without amountOutMin:', quoteError);
        calculatedAmountOutMin = "0";
      }
    }

    // Create swap request with processing status
    const swapRequest = new SwapRequest({
      userId: user._id,
      walletAddress: user.walletAddress,
      chain: "BSC",
      tokenIn: tokenIn.toLowerCase(),
      tokenOut: tokenOut.toLowerCase(),
      tokenInSymbol: tokenInSymbol || "",
      tokenOutSymbol: tokenOutSymbol || "",
      amountIn: amountIn,
      amountOut: amountOut || "",
      amountOutMin: calculatedAmountOutMin,
      feePercentage: feePercentage,
      feeAmount: feeAmountString,
      feeRecipientAddress: feeRecipientAddress,
      slippageTolerance: swapSlippage,
      deadline: swapDeadline,
      status: "processing", // Start as processing since we'll execute immediately
    });

    await swapRequest.save({ session });
    await session.commitTransaction();
    session.endSession();

    // Execute swap on-chain (outside of database transaction)
    // This allows the swap request to be saved even if swap execution fails
    let swapResult: any;
    try {
      swapResult = await executeBSCSwap({
        tokenIn: swapRequest.tokenIn,
        tokenOut: swapRequest.tokenOut,
        amountIn: swapRequest.amountIn,
        amountOutMin: swapRequest.amountOutMin || "0",
        walletAddress: swapRequest.walletAddress,
        encryptedPrivateKey: user.encryptedPrivateKey,
        slippageTolerance: swapRequest.slippageTolerance,
        deadline: swapRequest.deadline,
        feeRecipientAddress: swapRequest.feeRecipientAddress,
        feeAmount: swapRequest.feeAmount, // Pass fee amount for collection
      });

      // Update swap request with transaction result
      if (swapResult.success && swapResult.transactionHash) {
        swapRequest.status = "completed";
        swapRequest.transactionHash = swapResult.transactionHash;
        if (swapResult.amountOut) {
          swapRequest.amountOut = swapResult.amountOut;
        }
        swapRequest.completedAt = new Date();
        await swapRequest.save();

        // Log swap transaction
        try {
          const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL || "");
          const receipt = await provider.getTransactionReceipt(swapResult.transactionHash);
          
          if (receipt) {
            const gasFee = receipt.gasUsed * (receipt.gasPrice || BigInt(0));
            
            await createTransaction({
              userId: user._id.toString(),
              walletAddress: swapRequest.walletAddress,
              chain: "BSC",
              type: "swap",
              transactionHash: swapResult.transactionHash,
              blockNumber: receipt.blockNumber,
              blockHash: receipt.blockHash,
              from: swapRequest.walletAddress,
              tokenIn: swapRequest.tokenIn,
              tokenOut: swapRequest.tokenOut,
              tokenInSymbol: swapRequest.tokenInSymbol,
              tokenOutSymbol: swapRequest.tokenOutSymbol,
              amountIn: swapRequest.amountIn,
              amountOut: swapRequest.amountOut || swapResult.amountOut || "",
              gasUsed: receipt.gasUsed.toString(),
              gasPrice: receipt.gasPrice?.toString(),
              gasFee: ethers.formatEther(gasFee),
              status: "confirmed",
              confirmations: 1,
              transactionTimestamp: new Date(),
              confirmedAt: new Date(),
              swapRequestId: swapRequest._id.toString(),
            });
          }
        } catch (txLogError) {
          console.error("Error logging swap transaction:", txLogError);
          // Don't fail the swap if transaction logging fails
        }
      } else {
        swapRequest.status = "failed";
        swapRequest.errorMessage = swapResult.error || "Swap execution failed";
        await swapRequest.save();
      }
    } catch (swapError) {
      console.error("Error executing swap:", swapError);
      swapRequest.status = "failed";
      swapRequest.errorMessage = swapError instanceof Error ? swapError.message : "Unknown error during swap execution";
      await swapRequest.save();
    }

    // Return response based on swap result
    if (swapResult?.success) {
      return res.status(201).json({
        message: "Swap request created and executed successfully",
        data: {
          swapRequestId: swapRequest._id.toString(),
          walletAddress: swapRequest.walletAddress,
          tokenIn: swapRequest.tokenIn,
          tokenOut: swapRequest.tokenOut,
          tokenInSymbol: swapRequest.tokenInSymbol,
          tokenOutSymbol: swapRequest.tokenOutSymbol,
          amountIn: swapRequest.amountIn,
          amountOut: swapRequest.amountOut,
          amountOutMin: swapRequest.amountOutMin,
          feePercentage: swapRequest.feePercentage,
          feeAmount: swapRequest.feeAmount,
          feeRecipientAddress: swapRequest.feeRecipientAddress,
          status: swapRequest.status,
          transactionHash: swapRequest.transactionHash,
          createdAt: swapRequest.createdAt,
          completedAt: swapRequest.completedAt,
        },
      });
    } else {
      return res.status(201).json({
        message: "Swap request created but execution failed",
        data: {
          swapRequestId: swapRequest._id.toString(),
          walletAddress: swapRequest.walletAddress,
          tokenIn: swapRequest.tokenIn,
          tokenOut: swapRequest.tokenOut,
          tokenInSymbol: swapRequest.tokenInSymbol,
          tokenOutSymbol: swapRequest.tokenOutSymbol,
          amountIn: swapRequest.amountIn,
          amountOut: swapRequest.amountOut,
          amountOutMin: swapRequest.amountOutMin,
          feePercentage: swapRequest.feePercentage,
          feeAmount: swapRequest.feeAmount,
          feeRecipientAddress: swapRequest.feeRecipientAddress,
          status: swapRequest.status,
          errorMessage: swapRequest.errorMessage,
          createdAt: swapRequest.createdAt,
        },
      });
    }
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error creating swap request:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getUserSwapRequests = async (req: Request, res: Response) => {
  const { username } = req.query;

  try {
    if (!username) {
      return res.status(400).json({ message: "Username is required" });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const swapRequests = await SwapRequest.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      data: swapRequests,
      message: "Swap requests fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching swap requests:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getSwapRequest = async (req: Request, res: Response) => {
  const { swapRequestId } = req.params;

  try {
    if (!mongoose.Types.ObjectId.isValid(swapRequestId)) {
      return res.status(400).json({ message: "Invalid swap request ID" });
    }

    const swapRequest = await SwapRequest.findById(swapRequestId)
      .populate("userId", "username walletAddress")
      .lean();

    if (!swapRequest) {
      return res.status(404).json({ message: "Swap request not found" });
    }

    return res.status(200).json({
      data: swapRequest,
      message: "Swap request fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching swap request:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const updateSwapRequestStatus = async (req: Request, res: Response) => {
  const { swapRequestId } = req.params;
  const { status, transactionHash, amountOut, errorMessage } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!mongoose.Types.ObjectId.isValid(swapRequestId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Invalid swap request ID" });
    }

    const validStatuses = ["pending", "processing", "completed", "failed", "cancelled"];
    if (status && !validStatuses.includes(status)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const swapRequest = await SwapRequest.findById(swapRequestId).session(session);
    if (!swapRequest) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Swap request not found" });
    }

    if (status) swapRequest.status = status;
    if (transactionHash) swapRequest.transactionHash = transactionHash;
    if (amountOut) swapRequest.amountOut = amountOut;
    if (errorMessage) swapRequest.errorMessage = errorMessage;

    if (status === "completed") {
      swapRequest.completedAt = new Date();
    }

    await swapRequest.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      message: "Swap request updated successfully",
      data: {
        swapRequestId: swapRequest._id.toString(),
        status: swapRequest.status,
        transactionHash: swapRequest.transactionHash,
        amountOut: swapRequest.amountOut,
        completedAt: swapRequest.completedAt,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error updating swap request:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getAllSwapRequests = async (req: Request, res: Response) => {
  try {
    const { status, limit = 50, page = 1 } = req.query;

    const query: any = {};
    if (status) {
      query.status = status;
    }

    const skip = (Number(page) - 1) * Number(limit);

    const swapRequests = await SwapRequest.find(query)
      .populate("userId", "username walletAddress")
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip(skip)
      .lean();

    const total = await SwapRequest.countDocuments(query);

    return res.status(200).json({
      data: swapRequests,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
      message: "Swap requests fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching swap requests:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getSwapFeeStats = async (req: Request, res: Response) => {
  try {
    // Get total fees earned from completed swaps
    const completedSwaps = await SwapRequest.find({
      status: "completed",
    }).lean();

    let totalFeesEarned = 0;
    const feesByToken: { [key: string]: number } = {};

    completedSwaps.forEach((swap) => {
      const feeAmount = parseFloat(swap.feeAmount || "0");
      totalFeesEarned += feeAmount;

      const tokenSymbol = swap.tokenInSymbol || swap.tokenIn;
      if (tokenSymbol) {
        feesByToken[tokenSymbol] = (feesByToken[tokenSymbol] || 0) + feeAmount;
      }
    });

    const totalSwaps = await SwapRequest.countDocuments();
    const completedCount = await SwapRequest.countDocuments({
      status: "completed",
    });
    const pendingCount = await SwapRequest.countDocuments({
      status: "pending",
    });
    const failedCount = await SwapRequest.countDocuments({
      status: "failed",
    });

    return res.status(200).json({
      data: {
        totalFeesEarned: totalFeesEarned.toFixed(18),
        feesByToken,
        statistics: {
          totalSwaps,
          completed: completedCount,
          pending: pendingCount,
          failed: failedCount,
        },
      },
      message: "Swap fee statistics fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching swap fee stats:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

