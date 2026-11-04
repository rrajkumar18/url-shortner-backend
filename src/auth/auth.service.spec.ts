import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import * as argon2 from 'argon2';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('argon2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('argon2')>();
  return {
    ...actual,
    hash: vi.fn(),
  };
});

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: {
      create: ReturnType<typeof vi.fn>;
    };
  };

  const mockRegisterDto: RegisterDto = {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    password: 'Password123!',
  };

  const mockCreatedUser = {
    id: 'user-uuid-1',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  beforeEach(async () => {
    prisma = {
      user: {
        create: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('registerUser', () => {
    it('should successfully hash password, create user, and return success message', async () => {
      const mockHashedPassword = 'argon2id$v=19$mockedhash';
      vi.mocked(argon2.hash).mockResolvedValue(mockHashedPassword);
      prisma.user.create.mockResolvedValue(mockCreatedUser);

      const result = await service.registerUser(mockRegisterDto);

      expect(argon2.hash).toHaveBeenCalledWith(mockRegisterDto.password, {
        type: argon2.argon2id,
      });
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          firstName: mockRegisterDto.firstName,
          lastName: mockRegisterDto.lastName,
          email: mockRegisterDto.email,
          passwordHash: mockHashedPassword,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          createdAt: true,
        },
      });
      expect(result).toEqual({
        message: 'Account created successfully',
        user: mockCreatedUser,
      });
    });

    it('should throw ConflictException when email already exists (Prisma P2002 error)', async () => {
      vi.mocked(argon2.hash).mockResolvedValue('mocked_hash');
      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`email`)',
        {
          code: 'P2002',
          clientVersion: '7.10.0',
        },
      );
      prisma.user.create.mockRejectedValue(p2002Error);

      await expect(service.registerUser(mockRegisterDto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.registerUser(mockRegisterDto)).rejects.toThrow(
        'An account with this email already exists',
      );
    });

    it('should rethrow unexpected database errors', async () => {
      vi.mocked(argon2.hash).mockResolvedValue('mocked_hash');
      const unexpectedError = new Error('Database connection failed');
      prisma.user.create.mockRejectedValue(unexpectedError);

      await expect(service.registerUser(mockRegisterDto)).rejects.toThrow(
        unexpectedError,
      );
    });

    it('should rethrow non-P2002 Prisma errors without wrapping in ConflictException', async () => {
      vi.mocked(argon2.hash).mockResolvedValue('mocked_hash');
      const otherPrismaError = new Prisma.PrismaClientKnownRequestError(
        'Some other Prisma error',
        {
          code: 'P2000',
          clientVersion: '7.10.0',
        },
      );
      prisma.user.create.mockRejectedValue(otherPrismaError);

      await expect(service.registerUser(mockRegisterDto)).rejects.toThrow(
        otherPrismaError,
      );
      await expect(service.registerUser(mockRegisterDto)).rejects.not.toThrow(
        ConflictException,
      );
    });

    it('should propagate error if argon2 hashing fails and not call prisma', async () => {
      const hashingError = new Error('Argon2 hashing failure');
      vi.mocked(argon2.hash).mockRejectedValue(hashingError);

      await expect(service.registerUser(mockRegisterDto)).rejects.toThrow(
        hashingError,
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('registerUser', () => {
    it('should successfully hash password, create user, and return success message', async () => {
      const mockHashedPassword = 'argon2id$v=19$mockedhash';
      vi.mocked(argon2.hash).mockResolvedValue(mockHashedPassword);
      prisma.user.create.mockResolvedValue(mockCreatedUser);

      const result = await service.registerUser(mockRegisterDto);

      expect(argon2.hash).toHaveBeenCalledWith(mockRegisterDto.password, {
        type: argon2.argon2id,
      });
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          firstName: mockRegisterDto.firstName,
          lastName: mockRegisterDto.lastName,
          email: mockRegisterDto.email,
          passwordHash: mockHashedPassword,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          createdAt: true,
        },
      });
      expect(result).toEqual({
        message: 'Account created successfully',
        user: mockCreatedUser,
      });
    });

    it('should throw ConflictException when email already exists (Prisma P2002 error)', async () => {
      vi.mocked(argon2.hash).mockResolvedValue('mocked_hash');
      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`email`)',
        {
          code: 'P2002',
          clientVersion: '7.10.0',
        },
      );
      prisma.user.create.mockRejectedValue(p2002Error);

      await expect(service.registerUser(mockRegisterDto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.registerUser(mockRegisterDto)).rejects.toThrow(
        'An account with this email already exists',
      );
    });

    it('should rethrow unexpected database errors', async () => {
      vi.mocked(argon2.hash).mockResolvedValue('mocked_hash');
      const unexpectedError = new Error('Database connection failed');
      prisma.user.create.mockRejectedValue(unexpectedError);

      await expect(service.registerUser(mockRegisterDto)).rejects.toThrow(
        unexpectedError,
      );
    });

    it('should rethrow non-P2002 Prisma errors without wrapping in ConflictException', async () => {
      vi.mocked(argon2.hash).mockResolvedValue('mocked_hash');
      const otherPrismaError = new Prisma.PrismaClientKnownRequestError(
        'Some other Prisma error',
        {
          code: 'P2000',
          clientVersion: '7.10.0',
        },
      );
      prisma.user.create.mockRejectedValue(otherPrismaError);

      await expect(service.registerUser(mockRegisterDto)).rejects.toThrow(
        otherPrismaError,
      );
      await expect(
        service.registerUser(mockRegisterDto),
      ).rejects.not.toThrow(ConflictException);
    });

    it('should propagate error if argon2 hashing fails and not call prisma', async () => {
      const hashingError = new Error('Argon2 hashing failure');
      vi.mocked(argon2.hash).mockRejectedValue(hashingError);

      await expect(service.registerUser(mockRegisterDto)).rejects.toThrow(
        hashingError,
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });
});


