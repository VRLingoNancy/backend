import { PrismaClient } from '@prisma/client';
import { UserServiceError } from '../errors/UserServiceError';

export class UserService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Récupère les paramètres d'un utilisateur.
   * Si les paramètres n'existent pas, ils sont créés avec des valeurs par défaut.
   * @param userId L'ID de l'utilisateur.
   */
  async getUserSettings(userId: string) {
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId },
    });

    if (settings) {
      return settings;
    }

    const defaultSettings = {
      userId,
      nativeLanguageCode: 'en',
      interfaceLanguageCode: 'en',
    };

    try {
      const newSettings = await this.prisma.userSettings.create({
        data: defaultSettings,
      });
      return newSettings;
    } catch (error) {
      console.error('Failed to create default user settings:', error);
      throw new UserServiceError(
        'Could not retrieve or create user settings.',
        500
      );
    }
  }

  /**
   * Met à jour les paramètres d'un utilisateur.
   * @param userId L'ID de l'utilisateur.
   * @param data Les données à mettre à jour.
   */
  async updateUserSettings(
    userId: string,
    data: Partial<{
      nativeLanguageCode: string;
      interfaceLanguageCode: string;
      preferredStudyLanguage: string | null;
      defaultIaModel: string | null;
    }>
  ) {
    try {
      const updatedSettings = await this.prisma.userSettings.update({
        where: { userId },
        data,
      });
      return updatedSettings;
    } catch (error) {
      console.error('Failed to update user settings:', error);
      throw new UserServiceError('Could not update user settings.', 500);
    }
  }
}
