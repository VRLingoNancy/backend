import { PrismaClient, User } from '@prisma/client';
import bcrypt from 'bcrypt';
import { AuthServiceError } from '../errors/AuthServiceError';

export class AuthService {
  // eslint-disable-next-line no-unused-vars
  constructor(private prisma: PrismaClient) {}

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
