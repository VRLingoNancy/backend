import type { FastifyPluginAsync, FastifySchema } from 'fastify';
import { z } from 'zod';

const TtsRequestDto = z.object({
  text: z.string().min(1, 'text is required'),
  voice: z.string().optional(),
  format: z.enum(['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm']).optional(),
});

type TtsRequest = z.infer<typeof TtsRequestDto>;

const contentTypeByFormat: Record<string, string> = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  opus: 'audio/opus',
  aac: 'audio/aac',
  flac: 'audio/flac',
  pcm: 'application/octet-stream',
};

const ttsRoute: FastifyPluginAsync = async (fastify) => {
  const schema: FastifySchema = {
    summary: 'Text-to-speech (REST)',
    description:
      'Synthesizes speech from text using OpenAI audio.speech endpoint.',
    tags: ['ai', 'audio'],
    body: TtsRequestDto,
    response: {
      200: {
        type: 'string',
        format: 'binary',
      },
    },
  };

  fastify.post<{ Body: TtsRequest }>(
    '/tts',
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
        fastify.log.error({ traceId }, 'Missing OpenAI API key for TTS');
        return reply.code(500).send({
          error: 'CHATGPT_API_KEY (or OPENAI_API_KEY) is not configured',
        });
      }

      const format = request.body.format || 'wav';
      const voice = request.body.voice?.trim() || 'alloy';
      const model = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
      fastify.log.info(
        {
          traceId,
          clientStage,
          clientMode,
          format,
          voice,
          model,
          textLength: request.body.text.length,
        },
        'TTS request started'
      );

      const upstreamResponse = await fetch(
        'https://api.openai.com/v1/audio/speech',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            voice,
            input: request.body.text,
            response_format: format,
          }),
        }
      );

      if (!upstreamResponse.ok) {
        const payload = (await upstreamResponse.json()) as {
          error?: { message?: string };
        };
        fastify.log.error(
          {
            traceId,
            status: upstreamResponse.status,
            payload,
            durationMs: Date.now() - startedAt,
          },
          'OpenAI speech synthesis failed'
        );
        return reply.code(502).send({
          error:
            payload.error?.message || 'OpenAI speech synthesis request failed',
        });
      }

      const audioBuffer = Buffer.from(await upstreamResponse.arrayBuffer());
      fastify.log.info(
        {
          traceId,
          durationMs: Date.now() - startedAt,
          outputBytes: audioBuffer.length,
          outputFormat: format,
        },
        'TTS request completed'
      );
      reply.header('Content-Type', contentTypeByFormat[format] || 'audio/wav');
      reply.header('Content-Length', String(audioBuffer.length));
      return reply.send(audioBuffer);
    }
  );
};

export default ttsRoute;
