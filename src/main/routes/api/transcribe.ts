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
      const apiKey = process.env.CHATGPT_API_KEY ?? process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return reply.code(500).send({
          error: 'CHATGPT_API_KEY (or OPENAI_API_KEY) is not configured',
        });
      }

      let audioBuffer: Buffer;
      try {
        audioBuffer = Buffer.from(request.body.audio, 'base64');
      } catch {
        return reply.code(400).send({ error: 'audio must be valid base64' });
      }

      if (!audioBuffer.length) {
        return reply.code(400).send({ error: 'audio payload is empty' });
      }

      const mimeType = request.body.mimeType?.trim() || 'audio/wav';
      const language = request.body.language?.trim();

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
          { status: upstreamResponse.status, payload },
          'OpenAI transcription failed'
        );
        return reply.code(502).send({
          error:
            payload.error?.message || 'OpenAI transcription request failed',
        });
      }

      return reply.code(200).send({ text: payload.text || '' });
    }
  );
};

export default transcribeRoute;
