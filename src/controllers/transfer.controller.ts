import { Request, Response } from "express";
import User from "../model/user.model";
import mongoose from "mongoose";
import { executeBSCTokenTransfer, getTokenInfo } from "../utils/bscTransfer";
import { createTransaction } from "../services/transaction.service";
import { ethers } from "ethers";
import { logWalletOperation, logAdminOperation } from "../services/audit.service";

/**
 * Verify and load user by username
 */
export const verifyUsername = async (req: Request, res: Response) => {
  const { username } = req.query;

  try {
    // Validate username parameter
    if (!username || typeof username !== "string") {
      return res.status(400).json({
        message: "Username is required",
      });
    }

    // Find user by username
    const user = await User.findOne({ username }).lean();

    if (!user) {
      return res.status(404).json({
        message: "User not found",
        exists: false,
      });
    }

    // Return user info (excluding sensitive data)
    const { encryptedPrivateKey, password, ...userInfo } = user;

    return res.status(200).json({
      message: "User found",
      exists: true,
      data: {
        ...userInfo,
        hasWallet: !!user.walletAddress,
      },
    });
  } catch (error) {
    console.error("Error verifying username:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Send tokens to a user by username (internal transfer)
 */
export const sendTokensToUser = async (req: Request, res: Response) => {
  // Get authenticated user from JWT token
  if (!req.user) {
    return res.status(401).json({
      message: "Unauthorized: User not authenticated",
    });
  }

  const {
    username, // Recipient username
    tokenAddress,
    amount,
    tokenSymbol,
  } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Validate required fields
    if (!username || !tokenAddress || !amount) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: "Username, tokenAddress, and amount are required",
      });
    }

    // Find recipient user
    const recipientUser = await User.findOne({ username }).session(session);
    if (!recipientUser) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Recipient user not found" });
    }

    if (!recipientUser.walletAddress) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: "Recipient user does not have a wallet address",
      });
    }

    // Use authenticated user's wallet as sender
    const senderUser = await User.findById(req.user.id)
      .select("+encryptedPrivateKey")
      .session(session);
    
    if (!senderUser) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Sender user not found" });
    }

    if (!senderUser.walletAddress) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: "Sender user does not have a wallet address",
      });
    }

    if (!senderUser.encryptedPrivateKey) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: "Sender user does not have an encrypted private key",
      });
    }

    const senderWalletAddress = senderUser.walletAddress;
    const senderEncryptedPrivateKey = senderUser.encryptedPrivateKey;

    // Validate amount
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: "Invalid amount. Must be a positive number",
      });
    }

    // Get token info if not provided
    let finalTokenSymbol = tokenSymbol;
    if (!finalTokenSymbol) {
      try {
        const tokenInfo = await getTokenInfo(tokenAddress);
        finalTokenSymbol = tokenInfo.symbol;
      } catch (error) {
        console.warn("Could not fetch token symbol:", error);
        finalTokenSymbol = "UNKNOWN";
      }
    }

    await session.commitTransaction();
    session.endSession();

    // Get client IP for audit logging
    const clientIP =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      (req.headers["x-real-ip"] as string) ||
      req.socket.remoteAddress ||
      "";

    // Get authenticated user
    const authenticatedUser = (req.user as any);
    
    // Log transfer attempt
    logWalletOperation("TRANSFER_TO_USER", {
      userId: authenticatedUser?.id || "system",
      username: authenticatedUser?.username || "system",
      walletAddress: "", // Will be set after finding recipient
      amount,
      tokenAddress,
      ipAddress: clientIP,
    });

    // Execute transfer
    const transferResult = await executeBSCTokenTransfer({
      tokenAddress,
      toAddress: recipientUser.walletAddress,
      amount: amount,
      fromWalletAddress: senderWalletAddress,
      encryptedPrivateKey: senderEncryptedPrivateKey,
      tokenSymbol: finalTokenSymbol,
    });

    if (!transferResult.success) {
      // Log failed transfer
      logWalletOperation("TRANSFER", {
        userId: recipientUser._id.toString(),
        username: recipientUser.username,
        walletAddress: recipientUser.walletAddress,
        amount,
        tokenAddress,
        ipAddress: clientIP,
        success: false,
        error: transferResult.error,
      });

      return res.status(400).json({
        message: "Transfer failed",
        error: transferResult.error,
      });
    }

    // Get transaction receipt for logging
    let receipt;
    try {
      const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL || "");
      receipt = await provider.getTransactionReceipt(transferResult.transactionHash!);
    } catch (receiptError) {
      console.error("Error fetching transaction receipt:", receiptError);
    }

    // Log transaction
    try {
      const isNativeBNB = tokenAddress.toLowerCase() === ethers.ZeroAddress.toLowerCase() ||
                          tokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

      await createTransaction({
        userId: recipientUser._id.toString(),
        walletAddress: recipientUser.walletAddress,
        chain: "BSC",
        type: "deposit",
        transactionHash: transferResult.transactionHash!,
        blockNumber: receipt?.blockNumber,
        blockHash: receipt?.blockHash,
        from: senderWalletAddress,
        to: recipientUser.walletAddress,
        tokenAddress: isNativeBNB ? ethers.ZeroAddress : tokenAddress.toLowerCase(),
        tokenSymbol: finalTokenSymbol,
        amount: amount,
        amountFormatted: amount,
        gasUsed: transferResult.gasUsed,
        gasPrice: receipt?.gasPrice?.toString(),
        gasFee: transferResult.gasFee || "0",
        status: receipt ? "confirmed" : "pending",
        confirmations: receipt ? 1 : 0,
        transactionTimestamp: receipt ? new Date(Number(receipt.blockNumber) * 1000) : new Date(),
        confirmedAt: receipt ? new Date() : undefined,
        metadata: {
          transferType: "internal",
          fromUsername: req.user.username,
          toUsername: username,
        },
      });
    } catch (txLogError) {
      console.error("Error logging transfer transaction:", txLogError);
    }

    // Log successful transfer
    logWalletOperation("TRANSFER", {
      userId: recipientUser._id.toString(),
      username: recipientUser.username,
      walletAddress: recipientUser.walletAddress,
      transactionHash: transferResult.transactionHash,
      amount,
      tokenAddress,
      ipAddress: clientIP,
      success: true,
    });

    return res.status(200).json({
      message: "Tokens sent successfully",
      data: {
        transactionHash: transferResult.transactionHash,
        from: senderWalletAddress,
        to: recipientUser.walletAddress,
        toUsername: username,
        tokenAddress,
        tokenSymbol: finalTokenSymbol,
        amount,
        gasUsed: transferResult.gasUsed,
        gasFee: transferResult.gasFee,
        status: receipt ? "confirmed" : "pending",
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error sending tokens to user:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Send tokens to an external wallet address
 */
export const sendTokensToExternal = async (req: Request, res: Response) => {
  // Get authenticated user from JWT token
  if (!req.user) {
    return res.status(401).json({
      message: "Unauthorized: User not authenticated",
    });
  }

  const {
    toAddress, // External wallet address
    tokenAddress,
    amount,
    tokenSymbol,
  } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Validate required fields
    if (!toAddress || !tokenAddress || !amount) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: "toAddress, tokenAddress, and amount are required",
      });
    }

    // Validate recipient address
    if (!ethers.isAddress(toAddress)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: "Invalid recipient wallet address",
      });
    }

    // Use authenticated user's wallet as sender
    const senderUser = await User.findById(req.user.id)
      .select("+encryptedPrivateKey")
      .session(session);
    
    if (!senderUser) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Sender user not found" });
    }

    if (!senderUser.walletAddress) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: "Sender user does not have a wallet address",
      });
    }

    if (!senderUser.encryptedPrivateKey) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: "Sender user does not have an encrypted private key",
      });
    }

    const senderWalletAddress = senderUser.walletAddress;
    const senderEncryptedPrivateKey = senderUser.encryptedPrivateKey;

    // Validate amount
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: "Invalid amount. Must be a positive number",
      });
    }

    // Get token info if not provided
    let finalTokenSymbol = tokenSymbol;
    if (!finalTokenSymbol) {
      try {
        const tokenInfo = await getTokenInfo(tokenAddress);
        finalTokenSymbol = tokenInfo.symbol;
      } catch (error) {
        console.warn("Could not fetch token symbol:", error);
        finalTokenSymbol = "UNKNOWN";
      }
    }

    await session.commitTransaction();
    session.endSession();

    // Get client IP for audit logging
    const clientIP =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      (req.headers["x-real-ip"] as string) ||
      req.socket.remoteAddress ||
      "";

    // Get authenticated user
    const authenticatedUser = (req.user as any);
    
    // Log transfer attempt
    logWalletOperation("TRANSFER_TO_EXTERNAL", {
      userId: authenticatedUser?.id || "system",
      username: authenticatedUser?.username || "system",
      walletAddress: toAddress,
      amount,
      tokenAddress,
      ipAddress: clientIP,
    });

    // Execute transfer
    const transferResult = await executeBSCTokenTransfer({
      tokenAddress,
      toAddress: toAddress,
      amount: amount,
      fromWalletAddress: senderWalletAddress,
      encryptedPrivateKey: senderEncryptedPrivateKey,
      tokenSymbol: finalTokenSymbol,
    });

    if (!transferResult.success) {
      // Log failed transfer
      logWalletOperation("TRANSFER_EXTERNAL", {
        walletAddress: toAddress,
        amount,
        tokenAddress,
        ipAddress: clientIP,
        success: false,
        error: transferResult.error,
      });

      return res.status(400).json({
        message: "Transfer failed",
        error: transferResult.error,
      });
    }

    // Get transaction receipt for logging
    let receipt;
    try {
      const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL || "");
      receipt = await provider.getTransactionReceipt(transferResult.transactionHash!);
    } catch (receiptError) {
      console.error("Error fetching transaction receipt:", receiptError);
    }

    // Try to find user by wallet address for logging (optional)
    let recipientUser;
    try {
      recipientUser = await User.findOne({
        walletAddress: toAddress.toLowerCase(),
      });
    } catch (userError) {
      // User not found is okay for external transfers
    }

    // Log transaction if recipient is a user
    if (recipientUser) {
      try {
        const isNativeBNB = tokenAddress.toLowerCase() === ethers.ZeroAddress.toLowerCase() ||
                            tokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

        await createTransaction({
          userId: recipientUser._id.toString(),
          walletAddress: toAddress.toLowerCase(),
          chain: "BSC",
          type: "deposit",
          transactionHash: transferResult.transactionHash!,
          blockNumber: receipt?.blockNumber,
          blockHash: receipt?.blockHash,
          from: senderWalletAddress,
          to: toAddress.toLowerCase(),
          tokenAddress: isNativeBNB ? ethers.ZeroAddress : tokenAddress.toLowerCase(),
          tokenSymbol: finalTokenSymbol,
          amount: amount,
          amountFormatted: amount,
          gasUsed: transferResult.gasUsed,
          gasPrice: receipt?.gasPrice?.toString(),
          gasFee: transferResult.gasFee || "0",
          status: receipt ? "confirmed" : "pending",
          confirmations: receipt ? 1 : 0,
          transactionTimestamp: receipt ? new Date(Number(receipt.blockNumber) * 1000) : new Date(),
          confirmedAt: receipt ? new Date() : undefined,
          metadata: {
            transferType: "external",
            fromUsername: req.user.username,
            toAddress: toAddress,
          },
        });
      } catch (txLogError) {
        console.error("Error logging transfer transaction:", txLogError);
      }
    }

    // Log successful transfer
    logWalletOperation("TRANSFER_EXTERNAL", {
      walletAddress: toAddress,
      transactionHash: transferResult.transactionHash,
      amount,
      tokenAddress,
      ipAddress: clientIP,
      success: true,
    });

    return res.status(200).json({
      message: "Tokens sent successfully",
      data: {
        transactionHash: transferResult.transactionHash,
        from: senderWalletAddress,
        to: toAddress,
        tokenAddress,
        tokenSymbol: finalTokenSymbol,
        amount,
        gasUsed: transferResult.gasUsed,
        gasFee: transferResult.gasFee,
        status: receipt ? "confirmed" : "pending",
        recipientIsUser: !!recipientUser,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error sending tokens to external address:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

