import winston from "winston";
import path from "path";
import fs from "fs";

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: "matara-service" },
  transports: [
    // Write all logs to combined.log
    new winston.transports.File({
      filename: path.join(logsDir, "combined.log"),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Write error logs to error.log
    new winston.transports.File({
      filename: path.join(logsDir, "error.log"),
      level: "error",
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Write audit logs to audit.log
    new winston.transports.File({
      filename: path.join(logsDir, "audit.log"),
      level: "info",
      maxsize: 5242880, // 5MB
      maxFiles: 10, // Keep more audit logs
    }),
  ],
});

// Add console transport in development
if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
}

export interface AuditLogData {
  userId?: string;
  username?: string;
  action: string;
  resource?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: any;
  success?: boolean;
  error?: string;
  transactionHash?: string;
  walletAddress?: string;
  amount?: string;
  tokenAddress?: string;
}

/**
 * Log security-sensitive operations
 */
export const auditLog = (data: AuditLogData) => {
  const logEntry = {
    ...data,
    timestamp: new Date().toISOString(),
  };

  logger.info("AUDIT", logEntry);

  // Also log to console in development
  if (process.env.NODE_ENV !== "production") {
    console.log("[AUDIT]", logEntry);
  }
};

/**
 * Log wallet operations
 */
export const logWalletOperation = (
  action: string,
  data: {
    userId?: string;
    username?: string;
    walletAddress: string;
    transactionHash?: string;
    amount?: string;
    tokenAddress?: string;
    ipAddress?: string;
    success?: boolean;
    error?: string;
  }
) => {
  auditLog({
    action: `WALLET_${action.toUpperCase()}`,
    userId: data.userId,
    username: data.username,
    walletAddress: data.walletAddress,
    transactionHash: data.transactionHash,
    amount: data.amount,
    tokenAddress: data.tokenAddress,
    ipAddress: data.ipAddress,
    success: data.success,
    error: data.error,
  });
};

/**
 * Log authentication events
 */
export const logAuthEvent = (
  event: string,
  data: {
    userId?: string;
    username?: string;
    ipAddress?: string;
    success?: boolean;
    error?: string;
  }
) => {
  auditLog({
    action: `AUTH_${event.toUpperCase()}`,
    userId: data.userId,
    username: data.username,
    ipAddress: data.ipAddress,
    success: data.success,
    error: data.error,
  });
};

/**
 * Log admin operations
 */
export const logAdminOperation = (
  action: string,
  data: {
    adminId: string;
    adminUsername: string;
    resource?: string;
    details?: any;
    ipAddress?: string;
    success?: boolean;
    error?: string;
  }
) => {
  auditLog({
    action: `ADMIN_${action.toUpperCase()}`,
    userId: data.adminId,
    username: data.adminUsername,
    resource: data.resource,
    details: data.details,
    ipAddress: data.ipAddress,
    success: data.success,
    error: data.error,
  });
};

/**
 * Log suspicious activities
 */
export const logSuspiciousActivity = (
  activity: string,
  data: {
    userId?: string;
    username?: string;
    ipAddress?: string;
    details?: any;
  }
) => {
  logger.warn("SUSPICIOUS_ACTIVITY", {
    activity,
    ...data,
    timestamp: new Date().toISOString(),
  });
};

export default logger;

