import { PrismaClient } from '@prisma/client';
import { ConversationServiceError } from '../errors/ConversationServiceError';

export class ConversationService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Récupère la liste des conversations pour un utilisateur donné.
   * Ne retourne que les métadonnées (id, title, dates) pour une réponse légère.
   * @param userId - L'ID de l'utilisateur.
   */
  async listForUser(userId: string) {
    try {
      const conversations = await this.prisma.conversation.findMany({
        where: {
          userId: userId,
        },
        select: {
          id: true,
          title: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: {
          updatedAt: 'desc',
        },
      });

      return conversations;
    } catch (_error) {
      // Log l'erreur interne si nécessaire
      // console.error(error);
      throw new ConversationServiceError(
        'Failed to retrieve conversations',
        500
      );
    }
  }
}
