import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 1-100 for JPEG, 1-100 for WebP
  format?: 'jpeg' | 'webp' | 'png';
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
}

const DEFAULT_OPTIONS: CompressionOptions = {
  maxWidth: 1920,
  maxHeight: 1920,
  quality: 85,
  format: 'jpeg',
  fit: 'inside', // Maintains aspect ratio, fits within dimensions
};

/**
 * Compresses an image file and returns the path to the compressed file
 * @param inputPath - Path to the original image file
 * @param options - Compression options
 * @returns Path to the compressed image file
 */
export async function compressImage(
  inputPath: string,
  options: CompressionOptions = {}
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // Generate output path in the same directory as input
  const inputDir = path.dirname(inputPath);
  const inputExt = path.extname(inputPath);
  const outputFileName = `compressed_${uuidv4()}${inputExt}`;
  const outputPath = path.join(inputDir, outputFileName);

  try {
    let sharpInstance = sharp(inputPath);

    // Resize if dimensions are specified
    if (opts.maxWidth || opts.maxHeight) {
      sharpInstance = sharpInstance.resize(opts.maxWidth, opts.maxHeight, {
        fit: opts.fit,
        withoutEnlargement: true, // Don't enlarge if image is smaller
      });
    }

    // Apply format and quality based on format
    switch (opts.format) {
      case 'webp':
        await sharpInstance
          .webp({ quality: opts.quality })
          .toFile(outputPath);
        break;
      case 'png':
        await sharpInstance
          .png({ quality: opts.quality, compressionLevel: 9 })
          .toFile(outputPath);
        break;
      case 'jpeg':
      default:
        await sharpInstance
          .jpeg({ quality: opts.quality, mozjpeg: true })
          .toFile(outputPath);
        break;
    }

    // Get file sizes for logging
    const originalStats = await fs.stat(inputPath);
    const compressedStats = await fs.stat(outputPath);
    const compressionRatio = ((1 - compressedStats.size / originalStats.size) * 100).toFixed(2);

    console.log(`Image compressed: ${(originalStats.size / 1024).toFixed(2)}KB -> ${(compressedStats.size / 1024).toFixed(2)}KB (${compressionRatio}% reduction)`);

    // Delete original file and return compressed path
    await fs.unlink(inputPath);
    
    return outputPath;
  } catch (error) {
    // If compression fails, try to clean up and return original
    try {
      await fs.unlink(outputPath).catch(() => {});
    } catch {}
    
    console.error('Image compression failed:', error);
    // Return original path if compression fails
    return inputPath;
  }
}

/**
 * Compresses an image with optimized settings for logos/icons
 */
export async function compressLogo(
  inputPath: string,
  options: CompressionOptions = {}
): Promise<string> {
  return compressImage(inputPath, {
    maxWidth: 800,
    maxHeight: 800,
    quality: 90,
    format: 'jpeg',
    ...options,
  });
}

/**
 * Compresses an image with optimized settings for general uploads
 */
export async function compressGeneralImage(
  inputPath: string,
  options: CompressionOptions = {}
): Promise<string> {
  return compressImage(inputPath, {
    maxWidth: 1920,
    maxHeight: 1920,
    quality: 85,
    format: 'jpeg',
    ...options,
  });
}

