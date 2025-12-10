import { Request, Response } from "express";
import User from "../model/user.model";
import mongoose from "mongoose";
import { executeBSCTokenTransfer, getTokenInfo } from "../utils/bscTransfer";
import { createTransaction } from "../services/transaction.service";
import { ethers } from "ethers";

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
  const {
    username, // Recipient username
    tokenAddress,
    amount,
    tokenSymbol,
    fromUsername, // Optional: sender username (if not provided, uses system wallet)
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

    // Determine sender wallet
    let senderUser;
    let senderWalletAddress: string;
    let senderEncryptedPrivateKey: string;

    if (fromUsername) {
      // Use specified user's wallet as sender
      senderUser = await User.findOne({ username: fromUsername })
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

      senderWalletAddress = senderUser.walletAddress;
      senderEncryptedPrivateKey = senderUser.encryptedPrivateKey;
    } else {
      // Use system wallet (from environment)
      senderWalletAddress = process.env.SYSTEM_WALLET_ADDRESS || "";
      senderEncryptedPrivateKey = process.env.SYSTEM_ENCRYPTED_PRIVATE_KEY || "";

      if (!senderWalletAddress || !senderEncryptedPrivateKey) {
        await session.abortTransaction();
        session.endSession();
        return res.status(500).json({
          message: "System wallet not configured. Please provide fromUsername or configure SYSTEM_WALLET_ADDRESS and SYSTEM_ENCRYPTED_PRIVATE_KEY",
        });
      }
    }

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
          fromUsername: fromUsername || "system",
          toUsername: username,
        },
      });
    } catch (txLogError) {
      console.error("Error logging transfer transaction:", txLogError);
    }

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
  const {
    toAddress, // External wallet address
    tokenAddress,
    amount,
    tokenSymbol,
    fromUsername, // Optional: sender username (if not provided, uses system wallet)
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

    // Determine sender wallet
    let senderUser;
    let senderWalletAddress: string;
    let senderEncryptedPrivateKey: string;

    if (fromUsername) {
      // Use specified user's wallet as sender
      senderUser = await User.findOne({ username: fromUsername })
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

      senderWalletAddress = senderUser.walletAddress;
      senderEncryptedPrivateKey = senderUser.encryptedPrivateKey;
    } else {
      // Use system wallet (from environment)
      senderWalletAddress = process.env.SYSTEM_WALLET_ADDRESS || "";
      senderEncryptedPrivateKey = process.env.SYSTEM_ENCRYPTED_PRIVATE_KEY || "";

      if (!senderWalletAddress || !senderEncryptedPrivateKey) {
        await session.abortTransaction();
        session.endSession();
        return res.status(500).json({
          message: "System wallet not configured. Please provide fromUsername or configure SYSTEM_WALLET_ADDRESS and SYSTEM_ENCRYPTED_PRIVATE_KEY",
        });
      }
    }

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
            fromUsername: fromUsername || "system",
            toAddress: toAddress,
          },
        });
      } catch (txLogError) {
        console.error("Error logging transfer transaction:", txLogError);
      }
    }

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

