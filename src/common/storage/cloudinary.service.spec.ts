import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';

const mockApiResource = jest.fn();
const mockDestroy = jest.fn();
const mockSign = jest.fn().mockReturnValue('test-signature');

jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    utils: { api_sign_request: mockSign },
    api: { resource: mockApiResource },
    uploader: { destroy: mockDestroy },
  },
}));

import { CloudinaryService } from './cloudinary.service';

describe('CloudinaryService', () => {
  let service: CloudinaryService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CLOUDINARY_CLOUD_NAME = 'demo';
    process.env.CLOUDINARY_API_KEY = 'test-key';
    process.env.CLOUDINARY_API_SECRET = 'test-secret';
    process.env.CLOUDINARY_IMAGE_MAX_BYTES = '100';
    service = new CloudinaryService();
  });

  afterEach(() => {
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
    delete process.env.CLOUDINARY_IMAGE_MAX_BYTES;
  });

  it('creates image-only upload signatures', () => {
    const result = service.createUploadSignature({
      timestamp: 123,
      folder: 'user-avatars/user-1',
      publicId: 'avatar',
    });

    expect(result).toMatchObject({
      resourceType: 'image',
      uploadUrl: 'https://api.cloudinary.com/v1_1/demo/image/upload',
    });
    expect(mockSign).toHaveBeenCalled();
  });

  it('rejects an empty public id', async () => {
    await expect(service.assertImageWithinMaxBytes('')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('accepts an image within the configured size', async () => {
    mockApiResource.mockResolvedValue({ bytes: 99 });

    await expect(
      service.assertImageWithinMaxBytes('user-avatars/user-1/avatar'),
    ).resolves.toBeUndefined();
  });

  it('deletes and rejects an oversized image', async () => {
    mockApiResource.mockResolvedValue({ bytes: 101 });
    mockDestroy.mockResolvedValue({ result: 'ok' });

    await expect(
      service.assertImageWithinMaxBytes('user-avatars/user-1/avatar'),
    ).rejects.toThrow('Image exceeds the maximum size');
    expect(mockDestroy).toHaveBeenCalledWith('user-avatars/user-1/avatar', {
      resource_type: 'image',
    });
  });
});
