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

  /**
   * Démarre une nouvelle conversation avec un premier message utilisateur,
   * obtient une réponse de l'IA et persiste l'échange.
   * @param userId - L'ID de l'utilisateur qui démarre la conversation.
   * @param userMessageContent - Le contenu du premier message de l'utilisateur.
   */
  async startConversation(userId: string, userMessageContent: string) {
    try {
      // Simuler un appel à une API d'IA
      const aiResponse = {
        content: `This is a simulated AI response to: "${userMessageContent}"`,
        usage: {
          promptTokens: 15,
          completionTokens: 25,
          totalTokens: 40,
        },
        model: 'gpt-sim-1',
      };

      // Simuler un coût pour les tokens. Par exemple, 0.002$ par 1000 tokens.
      const simulatedTokenCost = (aiResponse.usage.totalTokens / 1000) * 0.002;

      const result = await this.prisma.$transaction(async (tx) => {
        // Créer la conversation
        const conversation = await tx.conversation.create({
          data: {
            userId: userId,
            title: userMessageContent.substring(0, 50), // Titre basé sur le premier message
          },
        });

        // Enregistrer le message de l'utilisateur
        await tx.message.create({
          data: {
            conversationId: conversation.id,
            sender: 'USER',
            content: userMessageContent,
          },
        });

        // Enregistrer le log d'usage de l'IA
        const iaUsageLog = await tx.iAUsageLog.create({
          data: {
            userId: userId,
            model: aiResponse.model,
            promptTokens: aiResponse.usage.promptTokens,
            completionTokens: aiResponse.usage.completionTokens,
            totalTokens: aiResponse.usage.totalTokens,
            tokenCost: simulatedTokenCost.toString(),
          },
        });

        // Enregistrer le message de l'IA et le lier au log d'usage
        const aiMessage = await tx.message.create({
          data: {
            conversationId: conversation.id,
            sender: 'AI',
            content: aiResponse.content,
            iaUsageLogId: iaUsageLog.id,
          },
        });

        return {
          conversationId: conversation.id,
          aiResponse: {
            id: aiMessage.id,
            content: aiMessage.content,
            createdAt: aiMessage.createdAt,
          },
        };
      });

      return result;
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('!!! TRANSACTION FAILED in startConversation !!!', error);
      }

      // ! TODO Ajouter un log en BDD ici pour dire qu'une transaction à échoué

      throw new ConversationServiceError(
        'Failed to start a new conversation',
        500
      );
    }
  }
}
