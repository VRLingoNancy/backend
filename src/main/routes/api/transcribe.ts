import type { FastifyPluginAsync, FastifySchema } from 'fastify';
import { z } from 'zod';

const TranscribeRequestDto = z.object({
  audio: z.string().min(1, 'audio is required'),
  mimeType: z.string().optional(),
  language: z.string().optional(),
});

const TranscribeResponseDto = z.object({
  text: z.string(),
});

type TranscribeRequest = z.infer<typeof TranscribeRequestDto>;

const transcribeRoute: FastifyPluginAsync = async (fastify) => {
  const schema: FastifySchema = {
    summary: 'Speech-to-text (REST)',
    description:
      'Transcribes a base64 encoded audio payload (wav/pcm) with OpenAI Whisper.',
    tags: ['ai', 'audio'],
    body: TranscribeRequestDto,
    response: {
      200: TranscribeResponseDto,
    },
  };

  fastify.post<{ Body: TranscribeRequest }>(
    '/transcribe',
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
        fastify.log.error({ traceId }, 'Missing OpenAI API key for transcribe');
        return reply.code(500).send({
          error: 'CHATGPT_API_KEY (or OPENAI_API_KEY) is not configured',
        });
      }

      let audioBuffer: Buffer;
      try {
        audioBuffer = Buffer.from(request.body.audio, 'base64');
      } catch {
        fastify.log.warn({ traceId }, 'Invalid base64 payload for transcribe');
        return reply.code(400).send({ error: 'audio must be valid base64' });
      }

      if (!audioBuffer.length) {
        fastify.log.warn({ traceId }, 'Empty audio payload for transcribe');
        return reply.code(400).send({ error: 'audio payload is empty' });
      }

      const mimeType = request.body.mimeType?.trim() || 'audio/wav';
      const language = request.body.language?.trim();
      fastify.log.info(
        {
          traceId,
          clientStage,
          clientMode,
          mimeType,
          language,
          audioBytes: audioBuffer.length,
        },
        'Transcribe request started'
      );

      const formData = new FormData();
      const audioBlob = new Blob([audioBuffer], { type: mimeType });
      formData.append('file', audioBlob, 'utterance.wav');
      formData.append('model', process.env.OPENAI_STT_MODEL || 'whisper-1');
      if (language) {
        formData.append('language', language);
      }

      const upstreamResponse = await fetch(
        'https://api.openai.com/v1/audio/transcriptions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          body: formData,
        }
      );

      const payload = (await upstreamResponse.json()) as {
        text?: string;
        error?: { message?: string };
      };

      if (!upstreamResponse.ok) {
        fastify.log.error(
          {
            traceId,
            status: upstreamResponse.status,
            payload,
            durationMs: Date.now() - startedAt,
          },
          'OpenAI transcription failed'
        );
        return reply.code(502).send({
          error:
            payload.error?.message || 'OpenAI transcription request failed',
        });
      }

      fastify.log.info(
        {
          traceId,
          durationMs: Date.now() - startedAt,
          transcriptLength: payload.text?.length ?? 0,
        },
        'Transcribe request completed'
      );
      return reply.code(200).send({ text: payload.text || '' });
    }
  );
};

export default transcribeRoute;
