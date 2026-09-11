import { BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';

describe('UsersService avatar behavior', () => {
  const userId = 'user-1';
  const oldPublicId = `user-avatars/${userId}/old-avatar`;
  const baseUser = {
    id: userId,
    email: 'user@example.test',
    fullName: 'Test User',
    avatar:
      'https://res.cloudinary.com/demo/image/upload/user-avatars/user-1/old-avatar.webp',
    avatarPublicId: oldPublicId,
    phone: null,
    metadata: {},
    role: 'USER',
    status: 'ACTIVE',
    googleId: null,
    typeAuth: 'LOCAL',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
  };
  let cloudinary: {
    getCloudinaryConfig: jest.Mock;
    assertImageWithinMaxBytes: jest.Mock;
    deleteImage: jest.Mock;
    getImageOptimizationDefaults: jest.Mock;
    createUploadSignature: jest.Mock;
  };
  let service: UsersService;

  beforeEach(() => {
    process.env.CLOUDINARY_AVATAR_FOLDER = 'user-avatars';
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(baseUser),
        update: jest.fn().mockImplementation(({ data }) => ({
          ...baseUser,
          ...data,
        })),
      },
    };
    cloudinary = {
      getCloudinaryConfig: jest.fn().mockReturnValue({ cloudName: 'demo' }),
      assertImageWithinMaxBytes: jest.fn().mockResolvedValue(undefined),
      deleteImage: jest.fn().mockResolvedValue(undefined),
      getImageOptimizationDefaults: jest
        .fn()
        .mockReturnValue({ format: 'webp' }),
      createUploadSignature: jest.fn().mockReturnValue({ signature: 'signed' }),
    };

    service = new UsersService(
      prisma as never,
      {} as never,
      { invalidateUser: jest.fn() } as never,
      { invalidateAll: jest.fn() } as never,
      cloudinary as never,
    );
  });

  afterEach(() => {
    delete process.env.CLOUDINARY_AVATAR_FOLDER;
  });

  it('scopes upload signatures to the authenticated user folder', () => {
    service.createAvatarUploadSignature(userId, { publicId: 'profile-photo' });

    expect(cloudinary.createUploadSignature).toHaveBeenCalledWith(
      expect.objectContaining({
        folder: `user-avatars/${userId}`,
        publicId: 'profile-photo',
        format: 'webp',
      }),
    );
  });

  it('rejects an avatarPublicId owned by another user', async () => {
    await expect(
      service.setAvatar(userId, {
        avatar:
          'https://res.cloudinary.com/demo/image/upload/user-avatars/other/avatar.webp',
        avatarPublicId: 'user-avatars/other/avatar',
      }),
    ).rejects.toThrow('avatar does not belong to the current user');

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects lookalike Cloudinary hostnames', async () => {
    await expect(
      service.setAvatar(userId, {
        avatar:
          'https://evilres.cloudinary.com/demo/image/upload/user-avatars/user-1/avatar.webp',
        avatarPublicId: 'user-avatars/user-1/avatar',
      }),
    ).rejects.toThrow('avatar must be a valid Cloudinary https URL');
  });

  it('rejects an avatar URL that does not match avatarPublicId', async () => {
    await expect(
      service.setAvatar(userId, {
        avatar:
          'https://res.cloudinary.com/demo/image/upload/user-avatars/user-1/other.webp',
        avatarPublicId: 'user-avatars/user-1/avatar',
      }),
    ).rejects.toThrow('avatar URL does not match avatarPublicId');
  });

  it('accepts a verified owned image and removes the replaced image', async () => {
    const publicId = 'user-avatars/user-1/new-avatar';
    await service.setAvatar(userId, {
      avatar: `https://res.cloudinary.com/demo/image/upload/v123/${publicId}.webp`,
      avatarPublicId: publicId,
    });

    expect(cloudinary.assertImageWithinMaxBytes).toHaveBeenCalledWith(publicId);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ avatarPublicId: publicId }),
      }),
    );
    expect(cloudinary.deleteImage).toHaveBeenCalledWith(oldPublicId);
  });

  it('rejects mixed null avatar fields', async () => {
    await expect(
      service.updateUser(userId, {
        avatar: 'https://example.test/avatar.webp',
        avatarPublicId: null,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('clears a stale Cloudinary id during a legacy URL-only update', async () => {
    await service.updateUser(userId, {
      avatar: 'https://example.test/avatar.webp',
    });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          avatar: 'https://example.test/avatar.webp',
          avatarPublicId: null,
        }),
      }),
    );
    expect(cloudinary.deleteImage).toHaveBeenCalledWith(oldPublicId);
  });
});
