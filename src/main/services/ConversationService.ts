import { PrismaClient } from '@prisma/client';
import { ConversationServiceError } from '../errors/ConversationServiceError';
import { OpenAIService } from './OpenAIService';

// Tarifs approximatifs (en USD pour 1000 tokens) basés sur les prix Audio Realtime (Oct 2024)
// On prend le tarif "Audio" car c'est le mode principal, pour ne pas sous-estimer.
const PRICING_RATES: Record<string, { prompt: number; completion: number }> = {
  'gpt-4o-realtime-preview': { prompt: 0.1, completion: 0.2 }, // ~$100/1M in, $200/1M out
  'gpt-4o-mini-realtime-preview': { prompt: 0.01, completion: 0.02 }, // ~$10/1M in, $20/1M out
  'gpt-4o': { prompt: 0.005, completion: 0.015 },
  'gpt-4o-mini': { prompt: 0.00015, completion: 0.0006 },
  default: { prompt: 0.01, completion: 0.03 }, // Fallback
};

export class ConversationService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Analyse une conversation avec l'IA, stocke le score et l'appréciation dans la base.
   * @param conversationId string
   * @returns { aiScore: number, aiFeedback: string }
   */
  async scoreConversationWithAI(
    conversationId: string
  ): Promise<{ aiScore: number; aiFeedback: string; isNewScore: boolean }> {
    // 1. Récupérer tous les messages de la conversation (ordre chronologique)
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conversation)
      throw new ConversationServiceError('Conversation not found', 404);
    if (!conversation.messages.length)
      throw new ConversationServiceError('No messages in conversation', 400);

    // Si le score existe déjà, on le renvoie directement
    if (
      conversation.aiScore !== null &&
      conversation.aiScore !== undefined &&
      conversation.aiFeedback !== null &&
      conversation.aiFeedback !== undefined
    ) {
      return {
        aiScore: conversation.aiScore,
        aiFeedback: conversation.aiFeedback,
        isNewScore: false,
      };
    }

    // 2. Formater le prompt pour l'IA
    const dialogue = conversation.messages
      .map(
        (m) => `- ${m.sender === 'USER' ? 'Utilisateur' : 'IA'}: ${m.content}`
      )
      .join('\n');
    const prompt = `Voici une conversation entre un utilisateur et une intelligence artificielle pour pratiquer une langue.\n\n${dialogue}\n\nDonne une évaluation pédagogique de cette conversation.\nRéponds uniquement au format JSON strict suivant : {\n  \\"score\\": <nombre entre 0 et 100>,\n  \\"appreciation\\": <texte synthétique d'appréciation pédagogique>\n}`;

    // 3. Appeler OpenAI
    const openai = new OpenAIService();
    const completion = await openai.chatCompletion({
      messages: [
        {
          role: 'system',
          content: 'Tu es un expert en pédagogie des langues.',
        },
        { role: 'user', content: prompt },
      ],
      model: 'gpt-4o',
      temperature: 0.2,
      max_tokens: 512,
    });

    // 4. Extraire le JSON de la réponse
    let aiScore = 0;
    let aiFeedback = '';
    try {
      const text = completion.choices?.[0]?.message?.content || '';
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('No JSON found in response');
      const parsed = JSON.parse(match[0]);
      aiScore = Number(parsed.score);
      aiFeedback = String(parsed.appreciation);
    } catch (err) {
      throw new ConversationServiceError(
        'Failed to parse AI feedback: ' + (err as Error).message,
        500
      );
    }

    // 5. Mettre à jour la conversation
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { aiScore, aiFeedback },
    });

    return { aiScore, aiFeedback, isNewScore: true };
  }

  /**
   * Enregistre un tour de parole (User + AI) généré par l'API Realtime.
   * Si conversationId est fourni, ajoute à la conversation. Sinon, en crée une nouvelle.
   */
  async logRealtimeTurn(
    userId: string,
    conversationId: string | null,
    userContent: string,
    aiContent: string,
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      promptTextTokens?: number;
      promptAudioTokens?: number;
      completionTextTokens?: number;
      completionAudioTokens?: number;
    },
    model: string,
    languageCode?: string // Ajout paramètre optionnel
  ) {
    try {
      // Calcul du coût réel basé sur le modèle
      const rates = PRICING_RATES[model] || PRICING_RATES['default'];
      const realCost =
        (usage.promptTokens / 1000) * rates.prompt +
        (usage.completionTokens / 1000) * rates.completion;

      return await this.prisma.$transaction(async (tx) => {
        let activeConvId = conversationId;

        // 1. Création ou Vérification de la conversation
        if (!activeConvId) {
          const conv = await tx.conversation.create({
            data: {
              userId,
              languageCode: languageCode, // Stockage de la langue
              title: userContent
                ? userContent.substring(0, 50)
                : 'Conversation Audio',
            },
          });
          activeConvId = conv.id;
        } else {
          // Vérification de sécurité
          const exists = await tx.conversation.findUnique({
            where: { id: activeConvId, userId },
          });
          if (!exists) {
            throw new ConversationServiceError(
              'Conversation not found or access denied',
              404
            );
          }
          // Update timestamp
          await tx.conversation.update({
            where: { id: activeConvId },
            data: { updatedAt: new Date() },
          });
        }

        // 2. Message Utilisateur
        if (userContent) {
          await tx.message.create({
            data: {
              conversationId: activeConvId!,
              sender: 'USER',
              content: userContent,
            },
          });
        }

        // 3. Log d'usage IA
        const iaUsageLog = await tx.iAUsageLog.create({
          data: {
            userId,
            model,
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.totalTokens,
            tokenCost: realCost.toFixed(6),
            // Détails (avec valeurs par défaut si undefined pour compatibilité)
            promptTextTokens: usage.promptTextTokens ?? 0,
            promptAudioTokens: usage.promptAudioTokens ?? 0,
            completionTextTokens: usage.completionTextTokens ?? 0,
            completionAudioTokens: usage.completionAudioTokens ?? 0,
          },
        });

        // 4. Message IA
        await tx.message.create({
          data: {
            conversationId: activeConvId!,
            sender: 'AI',
            content: aiContent || '(Audio response)', // Fallback si pas de transcript
            iaUsageLogId: iaUsageLog.id,
          },
        });

        return { conversationId: activeConvId! };
      });
    } catch (error) {
      if (error instanceof ConversationServiceError) throw error;
      console.error('Failed to log realtime turn:', error);
      throw new ConversationServiceError('Failed to log realtime turn', 500);
    }
  }

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
  /**
   * Récupère une conversation par son ID (sans vérification d'utilisateur).
   * @param conversationId L'ID de la conversation à récupérer.
   */
  async getById(conversationId: string) {
    return this.prisma.conversation.findUnique({
      where: {
        id: conversationId,
      },
    });
  }

  /**
   * Récupère une conversation par son ID, en s'assurant qu'elle appartient à l'utilisateur.
   * Inclut tous les messages de la conversation, triés par date de création.
   * @param conversationId L'ID de la conversation à récupérer.
   * @param userId L'ID de l'utilisateur qui fait la demande.
   */
  async getByIdAndUser(conversationId: string, userId: string) {
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
