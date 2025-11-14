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

  /**
   * Récupère une conversation par son ID, en s'assurant qu'elle appartient à l'utilisateur.
   * Inclut tous les messages de la conversation, triés par date de création.
   * @param conversationId L'ID de la conversation à récupérer.
   * @param userId L'ID de l'utilisateur qui fait la demande.
   */
  async getById(conversationId: string, userId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        userId: userId, // Condition de sécurité cruciale !
      },
      include: {
        messages: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!conversation) {
      throw new ConversationServiceError(
        'Conversation not found or access denied',
        404
      );
    }

    return conversation;
  }

  /**
   * Ajoute un message utilisateur à une conversation existante en s'assurant
   * que la conversation appartient à l'utilisateur.
   * @param conversationId L'ID de la conversation.
   * @param userId L'ID de l'utilisateur qui envoie le message.
   * @param content Le contenu du message utilisateur.
   */
  async addMessage(conversationId: string, userId: string, content: string) {
    try {
      // Simuler un appel à une API d'IA (même logique que startConversation)
      const aiResponse = {
        content: `This is a simulated AI response to: "${content}"`,
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
        },
        model: 'gpt-sim-1',
      };

      const simulatedTokenCost = (aiResponse.usage.totalTokens / 1000) * 0.002;

      const result = await this.prisma.$transaction(async (tx) => {
        const conv = await tx.conversation.findUnique({
          where: { id: conversationId },
          select: { id: true, userId: true },
        });

        if (!conv || conv.userId !== userId) {
          throw new ConversationServiceError(
            'Conversation not found or access denied',
            404
          );
        }

        const userMessage = await tx.message.create({
          data: {
            conversationId: conversationId,
            sender: 'USER',
            content: content,
          },
          select: {
            id: true,
            conversationId: true,
            sender: true,
            content: true,
            createdAt: true,
          },
        });

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

        // Enregistrer le message de l'IA et le lier au log d'usage. Sélectionner
        // uniquement les champs nécessaires pour la réponse.
        const aiMessage = await tx.message.create({
          data: {
            conversationId: conversationId,
            sender: 'AI',
            content: aiResponse.content,
            iaUsageLogId: iaUsageLog.id,
          },
          select: {
            id: true,
            content: true,
            createdAt: true,
          },
        });

        // Mettre à jour updatedAt de la conversation pour refléter l'activité
        await tx.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        });

        return {
          userMessage,
          aiResponse: {
            id: aiMessage.id,
            content: aiMessage.content,
            createdAt: aiMessage.createdAt,
          },
        };
      });

      return result;
    } catch (err) {
      if (err instanceof ConversationServiceError) throw err;
      throw new ConversationServiceError(
        'Failed to add message to conversation',
        500
      );
    }
  }

  /**
   * Supprime une conversation par son ID, en s'assurant qu'elle appartient à l'utilisateur.
   * @param conversationId L'ID de la conversation à supprimer.
   * @param userId L'ID de l'utilisateur qui fait la demande.
   */
  async deleteById(conversationId: string, userId: string) {
    // On utilise deleteMany avec une clause `where` complexe pour une suppression atomique et sécurisée.
    // Si la conversation n'existe pas ou n'appartient pas à l'utilisateur, `count` sera 0.
    const { count } = await this.prisma.conversation.deleteMany({
      where: {
        id: conversationId,
        userId: userId, // Condition de sécurité cruciale !
      },
    });

    if (count === 0) {
      throw new ConversationServiceError(
        'Conversation not found or access denied',
        404
      );
    }
  }
}
