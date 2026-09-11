import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';

export type CloudinaryUploadSignature = {
  signature: string;
  timestamp: number;
  folder: string;
  apiKey: string;
  cloudName: string;
  resourceType: 'image';
  uploadUrl: string;
  format?: string;
  quality?: string;
  maxBytes?: number;
  maxFileSizeMb?: number;
};

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  private readonly cloudName: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly configured: boolean;

  constructor() {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim() ?? '';
    const apiKey = process.env.CLOUDINARY_API_KEY?.trim() ?? '';
    const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim() ?? '';

    this.cloudName = cloudName;
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.configured = Boolean(cloudName && apiKey && apiSecret);

    if (!this.configured) {
      this.logger.warn(
        'Cloudinary is not configured (CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET). Avatar upload will fail until set.',
      );
      return;
    }

    cloudinary.config({
      cloud_name: this.cloudName,
      api_key: this.apiKey,
      api_secret: this.apiSecret,
      secure: true,
    });
  }

  private ensureConfigured(): void {
    if (!this.configured) {
      throw new InternalServerErrorException(
        'Cloudinary is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.',
      );
    }
  }

  getCloudinaryConfig() {
    this.ensureConfigured();
    return {
      cloudName: this.cloudName,
      apiKey: this.apiKey,
    };
  }

  getImageOptimizationDefaults(): { format?: string; quality?: string } {
    const format = (process.env.CLOUDINARY_IMAGE_FORMAT ?? 'webp')
      .trim()
      .toLowerCase();
    const quality = (process.env.CLOUDINARY_IMAGE_QUALITY ?? '')
      .trim()
      .toLowerCase();

    return {
      ...(format ? { format } : {}),
      ...(quality ? { quality } : {}),
    };
  }

  getImageMaxBytes(): number {
    const fromEnv = Number(process.env.CLOUDINARY_IMAGE_MAX_BYTES);
    if (Number.isFinite(fromEnv) && fromEnv > 0) {
      return Math.floor(fromEnv);
    }
    return 2 * 1024 * 1024;
  }

  createUploadSignature(params: {
    timestamp: number;
    folder: string;
    publicId?: string;
    format?: string;
    quality?: string;
    includeMaxBytes?: boolean;
  }): CloudinaryUploadSignature {
    this.ensureConfigured();
    const signingParams: Record<string, string | number> = {
      timestamp: params.timestamp,
      folder: params.folder,
    };

    if (params.publicId) {
      signingParams.public_id = params.publicId;
    }

    const format = params.format?.trim().toLowerCase();
    if (format) {
      signingParams.format = format;
    }

    const quality = params.quality?.trim();
    if (quality) {
      signingParams.quality = quality;
    }

    const signature = cloudinary.utils.api_sign_request(
      signingParams,
      this.apiSecret,
    );

    const maxBytes = params.includeMaxBytes
      ? this.getImageMaxBytes()
      : undefined;

    return {
      signature,
      timestamp: params.timestamp,
      folder: params.folder,
      apiKey: this.apiKey,
      cloudName: this.cloudName,
      resourceType: 'image' as const,
      uploadUrl: `https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`,
      ...(format ? { format } : {}),
      ...(quality ? { quality } : {}),
      ...(maxBytes
        ? {
            maxBytes,
            maxFileSizeMb: Number((maxBytes / (1024 * 1024)).toFixed(2)),
          }
        : {}),
    };
  }

  async assertImageWithinMaxBytes(publicId: string): Promise<void> {
    this.ensureConfigured();
    const maxBytes = this.getImageMaxBytes();
    const trimmed = publicId?.trim();
    if (!trimmed) {
      throw new BadRequestException('avatarPublicId is required');
    }

    let bytes: number;
    try {
      const resource = await cloudinary.api.resource(trimmed, {
        resource_type: 'image',
      });
      bytes = Number(resource?.bytes);
    } catch (error: any) {
      this.logger.warn(
        `Unable to read Cloudinary image metadata: ${error?.message ?? error}`,
      );
      throw new BadRequestException(
        'Unable to verify uploaded image. Please re-upload the image.',
      );
    }

    if (!Number.isFinite(bytes) || bytes < 1) {
      throw new BadRequestException(
        'Unable to verify uploaded image size. Please re-upload the image.',
      );
    }

    if (bytes > maxBytes) {
      await this.deleteImage(trimmed);
      const maxMb = (maxBytes / (1024 * 1024)).toFixed(0);
      throw new BadRequestException(
        `Image exceeds the maximum size of ${maxMb}MB`,
      );
    }
  }

  async deleteImage(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    } catch {
      // Best effort cleanup only.
    }
  }
}
