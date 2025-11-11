import { PrismaClient, User } from '@prisma/client';
import bcrypt from 'bcrypt';
import { AuthServiceError } from '../errors/AuthServiceError';
import type { FastifyInstance } from 'fastify';

export class AuthService {
  constructor(private prisma: PrismaClient) {}

  async verifyAndRefreshToken(
    refreshToken: string,
    fastify: FastifyInstance
  ): Promise<User> {
    const tokenRecord = await this.prisma.authToken.findUnique({
      where: { refreshToken },
      include: { user: true },
    });

    if (!tokenRecord) {
      throw new AuthServiceError('Refresh token invalide', 401);
    }
    if (tokenRecord.revoked) {
      throw new AuthServiceError('Refresh token revoqué', 401);
    }
    if (tokenRecord.refreshExpiresAt < new Date()) {
      await this.prisma.authToken.update({
        where: { id: tokenRecord.id },
        data: { revoked: true },
      });
      throw new AuthServiceError('Refresh token expiré', 401);
    }

    try {
      await fastify.jwt.verify(refreshToken);
    } catch (err) {
      await this.prisma.authToken.update({
        where: { id: tokenRecord.id },
        data: { revoked: true },
      });
      console.error('Erreur de verification du refresh token JWT', err);
      throw new AuthServiceError('Refresh token malformé ou invalide', 401);
    }

    return tokenRecord.user;
  }

  async registerUser(
    email: string,
    password: string,
    username?: string
  ): Promise<User> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      throw new AuthServiceError('User already exists', 409);
    }

    if (username) {
      const existingUsername = await this.prisma.user.findUnique({
        where: { username },
      });
      if (existingUsername) {
        throw new AuthServiceError('Username already taken', 409);
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);

    try {
      const user = await this.prisma.user.create({
        data: {
          email,
          passwordHash,
          ...(username ? { username } : {}),
        },
      });
      return user;
    } catch (err) {
      console.error("Erreur dans la creation prisma d'un utilisateur", err);
      throw new AuthServiceError('Failed to create user', 500);
    }
  }

  async loginUser(
    email: string | undefined,
    username: string | undefined,
    password: string
  ): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: {
        ...(email ? { email } : {}),
        ...(username ? { username } : {}),
      },
    });

    if (!user) {
      throw new AuthServiceError('User not found', 401);
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw new AuthServiceError('Invalid credentials', 401);
    }

    return user;
  }
}
