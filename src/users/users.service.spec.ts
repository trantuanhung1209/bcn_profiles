import { BadRequestException } from '@nestjs/common';
import { MinioService } from '../common/storage/minio.service';
import { UsersService } from './users.service';

describe('UsersService avatar behavior', () => {
  const previousEnv = { ...process.env };
  const userId = 'user-1';
  const oldPublicId = `user-avatars/${userId}/old-avatar`;
  const baseUser = {
    id: userId,
    email: 'user@example.test',
    fullName: 'Test User',
    avatar:
      'https://storage.example.test/profiles/user-avatars/user-1/old-avatar',
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
  let minio: {
    assertObjectUrl: (url: string, key: string) => void;
    assertImageWithinMaxBytes: jest.Mock;
    deleteImage: jest.Mock;
    createUploadSignature: jest.Mock;
  };
  let service: UsersService;

  beforeEach(() => {
    process.env.MINIO_AVATAR_FOLDER = 'user-avatars';
    process.env.MINIO_ENDPOINT = 'https://storage.example.test';
    process.env.MINIO_BUCKET = 'profiles';
    process.env.MINIO_ACCESS_KEY = 'test-key';
    process.env.MINIO_SECRET_KEY = 'test-secret';
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(baseUser),
        update: jest.fn().mockImplementation(({ data }) => ({
          ...baseUser,
          ...data,
        })),
      },
    };
    minio = {
      assertObjectUrl: (url, key) =>
        new MinioService().assertObjectUrl(url, key),
      assertImageWithinMaxBytes: jest.fn().mockResolvedValue(undefined),
      deleteImage: jest.fn().mockResolvedValue(undefined),
      createUploadSignature: jest.fn().mockReturnValue({ signature: 'signed' }),
    };

    service = new UsersService(
      prisma as never,
      {} as never,
      { invalidateUser: jest.fn() } as never,
      { invalidateAll: jest.fn() } as never,
      minio as never,
    );
  });

  afterEach(() => {
    process.env = { ...previousEnv };
  });

  it('scopes upload signatures to the authenticated user folder', () => {
    service.createAvatarUploadSignature(userId, { publicId: 'profile-photo' });

    expect(minio.createUploadSignature).toHaveBeenCalledWith(
      expect.objectContaining({
        folder: `user-avatars/${userId}`,
        publicId: 'profile-photo',
      }),
    );
  });

  it('rejects an avatarPublicId owned by another user', async () => {
    await expect(
      service.setAvatar(userId, {
        avatar:
          'https://storage.example.test/profiles/user-avatars/other/avatar',
        avatarPublicId: 'user-avatars/other/avatar',
      }),
    ).rejects.toThrow('avatar does not belong to the current user');

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects lookalike MinIO hostnames', async () => {
    await expect(
      service.setAvatar(userId, {
        avatar:
          'https://evilstorage.example.test/profiles/user-avatars/user-1/avatar',
        avatarPublicId: 'user-avatars/user-1/avatar',
      }),
    ).rejects.toThrow('Object URL does not match');
  });

  it('rejects an avatar URL that does not match avatarPublicId', async () => {
    await expect(
      service.setAvatar(userId, {
        avatar:
          'https://storage.example.test/profiles/user-avatars/user-1/other',
        avatarPublicId: 'user-avatars/user-1/avatar',
      }),
    ).rejects.toThrow('Object URL does not match');
  });

  it('accepts a verified owned image and removes the replaced image', async () => {
    const publicId = 'user-avatars/user-1/new-avatar';
    await service.setAvatar(userId, {
      avatar: `https://storage.example.test/profiles/${publicId}`,
      avatarPublicId: publicId,
    });

    expect(minio.assertImageWithinMaxBytes).toHaveBeenCalledWith(publicId);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ avatarPublicId: publicId }),
      }),
    );
    expect(minio.deleteImage).toHaveBeenCalledWith(oldPublicId);
  });

  it('rejects mixed null avatar fields', async () => {
    await expect(
      service.updateUser(userId, {
        avatar: 'https://example.test/avatar',
        avatarPublicId: null,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('clears a stale MinIO id during a legacy URL-only update', async () => {
    await service.updateUser(userId, {
      avatar: 'https://example.test/avatar',
    });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          avatar: 'https://example.test/avatar',
          avatarPublicId: null,
        }),
      }),
    );
    expect(minio.deleteImage).toHaveBeenCalledWith(oldPublicId);
  });
});
