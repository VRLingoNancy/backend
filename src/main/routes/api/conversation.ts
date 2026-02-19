import type { FastifyPluginAsync, FastifySchema } from 'fastify';
import { z } from 'zod';

const ConversationRequestDto = z.object({
  message: z.string().min(1, 'message is required'),
  sessionId: z.string().optional(),
  locale: z.string().optional(),
  targetLanguage: z.string().optional(),
  proficiencyLevel: z.string().optional(),
  model: z.string().optional(),
});

const ConversationResponseDto = z.object({
  reply: z.string(),
  sessionId: z.string().optional(),
  model: z.string(),
});

type ConversationRequest = z.infer<typeof ConversationRequestDto>;

const conversationRoute: FastifyPluginAsync = async (fastify) => {
  const schema: FastifySchema = {
    summary: 'Single-turn conversation (REST)',
    description:
      'Transitional endpoint used by Unity push-to-talk pipeline: text in, text out.',
    tags: ['ai', 'conversation'],
    body: ConversationRequestDto,
    response: {
      200: ConversationResponseDto,
    },
  };

  fastify.post<{ Body: ConversationRequest }>(
    '/conversation',
    { schema },
    async (request, reply) => {
      const startedAt = Date.now();
      const traceId =
        typeof request.headers['x-trace-id'] === 'string'
          ? request.headers['x-trace-id']
          : request.id;
      const clientStage =
        typeof request.headers['x-client-stage'] === 'string'
          ? request.headers['x-client-stage']
          : undefined;
      const clientMode =
        typeof request.headers['x-client-mode'] === 'string'
          ? request.headers['x-client-mode']
          : undefined;

      const apiKey = process.env.CHATGPT_API_KEY ?? process.env.OPENAI_API_KEY;
      if (!apiKey) {
        fastify.log.error(
          { traceId },
          'Missing OpenAI API key for conversation'
        );
        return reply.code(500).send({
          error: 'CHATGPT_API_KEY (or OPENAI_API_KEY) is not configured',
        });
      }

      const message = request.body.message.trim();
      if (!message) {
        fastify.log.warn({ traceId }, 'Empty message for conversation');
        return reply.code(400).send({ error: 'message is required' });
      }

      const locale = request.body.locale?.trim() || 'fr-FR';
      const targetLanguage = request.body.targetLanguage?.trim() || locale;
      const level = request.body.proficiencyLevel?.trim() || 'A2';
      const model =
        request.body.model?.trim() ||
        process.env.OPENAI_CHAT_MODEL ||
        'gpt-4o-mini';
      fastify.log.info(
        {
          traceId,
          clientStage,
          clientMode,
          messageLength: message.length,
          locale,
          targetLanguage,
          level,
          model,
        },
        'Conversation request started'
      );

      const systemPrompt = [
        'You are VRLingo, a concise and supportive language coach.',
        `The target language for this learner is ${targetLanguage}.`,
        `The learner proficiency level is ${level}.`,
        'Reply in the target language unless the user explicitly asks for an explanation.',
        'Keep each answer short and practical for spoken practice.',
      ].join(' ');

      const upstreamResponse = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            temperature: 0.7,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: message },
            ],
          }),
        }
      );

      const payload = (await upstreamResponse.json()) as {
        error?: { message?: string };
        model?: string;
        choices?: Array<{ message?: { content?: string } }>;
      };

      if (!upstreamResponse.ok) {
        fastify.log.error(
          {
            traceId,
            status: upstreamResponse.status,
            payload,
            durationMs: Date.now() - startedAt,
          },
          'OpenAI chat completion failed'
        );
        return reply.code(502).send({
          error:
            payload.error?.message || 'OpenAI chat completion request failed',
        });
      }

      const aiReply = payload.choices?.[0]?.message?.content?.trim();
      if (!aiReply) {
        fastify.log.error(
          { traceId, durationMs: Date.now() - startedAt },
          'OpenAI chat completion returned empty reply'
        );
        return reply
          .code(502)
          .send({ error: 'Empty reply from language model' });
      }

      fastify.log.info(
        {
          traceId,
          durationMs: Date.now() - startedAt,
          replyLength: aiReply.length,
          model: payload.model || model,
        },
        'Conversation request completed'
      );
      return reply.code(200).send({
        reply: aiReply,
        sessionId: request.body.sessionId,
        model: payload.model || model,
      });
    }
  );
};

export default conversationRoute;
