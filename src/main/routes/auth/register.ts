import type { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcrypt';
import { RegisterUserRequestDto } from '../../dtos/RegisterUserRequestDto';

const registerRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post('/register', async (request, reply) => {
    const parseResult = RegisterUserRequestDto.safeParse(request.body);

    if (!parseResult.success) {
      return reply
        .code(400)
        .send({ error: 'Invalid data', details: parseResult.error.issues });
    }

    const data = parseResult.data;
    const { email, password, username } = data;

    const existingUser = await fastify.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      return reply.code(409).send({ error: 'User already exists' });
    }

    if (username) {
      const existingUsername = await fastify.prisma.user.findUnique({
        where: { username },
      });
      if (existingUsername) {
        return reply.code(409).send({ error: 'Username already taken' });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await fastify.prisma.user.create({
      data: {
        email,
        passwordHash,
        ...(username ? { username } : {}),
      },
    });

    reply.code(201).send({
      id: user.id,
      email: user.email,
      username: user.username ?? null,
    });
  });
};

export default registerRoute;
