import { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { body, param, query, validationResult } from "express-validator";
import { isTokenSupported, getTokenByAddress, getTokenBySymbol } from "../config/tokens";

/**
 * Security headers middleware using Helmet
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true,
  xssFilter: true,
  frameguard: { action: "deny" },
});

/**
 * Rate limiting for general API endpoints
 */
export const generalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Strict rate limiting for authentication endpoints
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login attempts per windowMs
  message: "Too many authentication attempts, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

/**
 * Very strict rate limiting for wallet operations
 */
export const walletOperationRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 wallet operations per hour
  message: "Too many wallet operations, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiting for transfer operations
 */
export const transferRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Limit each IP to 20 transfers per hour
  message: "Too many transfer requests, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiting for swap operations
 */
export const swapRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30, // Limit each IP to 30 swaps per hour
  message: "Too many swap requests, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Validation error handler middleware
 */
export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: false,
      message: "Validation failed",
      errors: errors.array(),
    });
  }
  next();
};

/**
 * Wallet address validation
 */
export const validateWalletAddress = [
  body("walletAddress")
    .optional()
    .custom((value) => {
      if (typeof value !== "string") {
        throw new Error("Wallet address must be a string");
      }
      // Ethereum/BSC address validation (0x followed by 40 hex characters)
      if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
        throw new Error("Invalid wallet address format");
      }
      return true;
    }),
  handleValidationErrors,
];

/**
 * Token address validation - checks format and if token is supported
 */
export const validateTokenAddress = [
  body("tokenAddress")
    .notEmpty()
    .withMessage("Token address is required")
    .custom((value) => {
      if (typeof value !== "string") {
        throw new Error("Token address must be a string");
      }
      
      const normalizedValue = value.toLowerCase();
      
      // Check if it's a valid address format or native indicator
      const nativeIndicators = [
        "native",
        "0x0000000000000000000000000000000000000000",
        "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      ];
      
      const isValidFormat = nativeIndicators.includes(normalizedValue) || 
                           /^0x[a-fA-F0-9]{40}$/.test(value);
      
      if (!isValidFormat) {
        throw new Error("Invalid token address format");
      }
      
      // Check if token is supported
      if (!isTokenSupported(value)) {
        const tokenInfo = getTokenByAddress(value);
        throw new Error(
          `Token not supported. Supported tokens: MARS, BNB, WKC, DTG, YUKAN, TWD, TKC, ETH, USDT`
        );
      }
      
      return true;
    }),
  handleValidationErrors,
];

/**
 * Validate tokenIn for swap operations (accepts both symbols and addresses)
 */
export const validateTokenIn = [
  body("tokenIn")
    .notEmpty()
    .withMessage("tokenIn is required")
    .custom((value) => {
      if (typeof value !== "string") {
        throw new Error("tokenIn must be a string");
      }
      
      // First, try to resolve as a symbol
      const tokenBySymbol = getTokenBySymbol(value);
      if (tokenBySymbol) {
        // Valid symbol - will be resolved to address in controller
        return true;
      }
      
      // If not a symbol, check if it's a valid address format
      const normalizedValue = value.toLowerCase();
      const nativeIndicators = [
        "native",
        "0x0000000000000000000000000000000000000000",
        "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      ];
      
      const isValidFormat = nativeIndicators.includes(normalizedValue) || 
                           /^0x[a-fA-F0-9]{40}$/.test(value);
      
      if (!isValidFormat) {
        throw new Error("Invalid tokenIn format. Must be a token symbol (e.g., USDT, BNB) or a valid contract address");
      }
      
      if (!isTokenSupported(value)) {
        throw new Error(
          `tokenIn not supported. Supported tokens: MARS, BNB, WKC, DTG, YUKAN, TWD, TKC, ETH, USDT`
        );
      }
      
      return true;
    }),
  handleValidationErrors,
];

/**
 * Validate tokenOut for swap operations (accepts both symbols and addresses)
 */
export const validateTokenOut = [
  body("tokenOut")
    .notEmpty()
    .withMessage("tokenOut is required")
    .custom((value) => {
      if (typeof value !== "string") {
        throw new Error("tokenOut must be a string");
      }
      
      // First, try to resolve as a symbol
      const tokenBySymbol = getTokenBySymbol(value);
      if (tokenBySymbol) {
        // Valid symbol - will be resolved to address in controller
        return true;
      }
      
      // If not a symbol, check if it's a valid address format
      const normalizedValue = value.toLowerCase();
      const nativeIndicators = [
        "native",
        "0x0000000000000000000000000000000000000000",
        "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      ];
      
      const isValidFormat = nativeIndicators.includes(normalizedValue) || 
                           /^0x[a-fA-F0-9]{40}$/.test(value);
      
      if (!isValidFormat) {
        throw new Error("Invalid tokenOut format. Must be a token symbol (e.g., USDT, BNB) or a valid contract address");
      }
      
      if (!isTokenSupported(value)) {
        throw new Error(
          `tokenOut not supported. Supported tokens: MARS, BNB, WKC, DTG, YUKAN, TWD, TKC, ETH, USDT`
        );
      }
      
      return true;
    }),
  handleValidationErrors,
];

/**
 * Amount validation (for transfers)
 */
export const validateAmount = [
  body("amount")
    .notEmpty()
    .withMessage("Amount is required")
    .custom((value) => {
      const num = parseFloat(value);
      if (isNaN(num) || num <= 0) {
        throw new Error("Amount must be a positive number");
      }
      if (num > 1e18) {
        throw new Error("Amount is too large");
      }
      return true;
    }),
  handleValidationErrors,
];

/**
 * Amount validation for swap operations (validates amountIn)
 */
export const validateAmountIn = [
  body("amountIn")
    .notEmpty()
    .withMessage("amountIn is required")
    .custom((value) => {
      const num = parseFloat(value);
      if (isNaN(num) || num <= 0) {
        throw new Error("amountIn must be a positive number");
      }
      if (num > 1e18) {
        throw new Error("amountIn is too large");
      }
      return true;
    }),
  handleValidationErrors,
];

/**
 * Username validation
 */
export const validateUsername = [
  body("username")
    .notEmpty()
    .withMessage("Username is required")
    .isLength({ min: 3, max: 50 })
    .withMessage("Username must be between 3 and 50 characters")
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage("Username can only contain letters, numbers, and underscores"),
  handleValidationErrors,
];

/**
 * Sanitize input to prevent injection attacks
 */
export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  // Recursively sanitize object
  const sanitize = (obj: any): any => {
    if (typeof obj === "string") {
      // Remove potentially dangerous characters
      return obj
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/javascript:/gi, "")
        .replace(/on\w+\s*=/gi, "")
        .trim();
    }
    if (Array.isArray(obj)) {
      return obj.map(sanitize);
    }
    if (obj && typeof obj === "object") {
      const sanitized: any = {};
      for (const key in obj) {
        sanitized[key] = sanitize(obj[key]);
      }
      return sanitized;
    }
    return obj;
  };

  if (req.body) {
    req.body = sanitize(req.body);
  }
  if (req.query) {
    req.query = sanitize(req.query);
  }
  if (req.params) {
    req.params = sanitize(req.params);
  }

  next();
};

/**
 * Request timeout middleware
 */
export const requestTimeout = (timeoutMs: number = 30000) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({
          status: false,
          message: "Request timeout",
        });
      }
    }, timeoutMs);

    res.on("finish", () => {
      clearTimeout(timer);
    });

    next();
  };
};

/**
 * IP whitelist middleware for admin operations
 * Only applies in production if ADMIN_IP_WHITELIST is set
 */
export const adminIPWhitelist = (allowedIPs: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip whitelist check in development or if no IPs configured
    if (process.env.NODE_ENV !== "production" || allowedIPs.length === 0) {
      return next();
    }

    const clientIP =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      (req.headers["x-real-ip"] as string) ||
      req.socket.remoteAddress ||
      "";

    if (!allowedIPs.includes(clientIP)) {
      return res.status(403).json({
        status: false,
        message: "Access denied: IP not whitelisted for admin operations",
      });
    }

    next();
  };
};

