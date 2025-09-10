import type { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcrypt';
import { LoginUserRequestDto } from '../../dtos/LoginUserRequestDto';

const loginRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post('/login', async (request, reply) => {
    const parseResult = LoginUserRequestDto.safeParse(request.body);
    if (!parseResult.success) {
      return reply
        .code(400)
        .send({ error: 'Invalid data', details: parseResult.error.issues });
    }
    const { email, username, password } = parseResult.data;

    const user = await fastify.prisma.user.findFirst({
      where: {
        ...(email ? { email } : {}),
        ...(username ? { username } : {}),
      },
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const accessToken = fastify.jwt.sign(
      { sub: user.id, role: user.role },
      { expiresIn: '15m' }
    );

    const refreshToken = fastify.jwt.sign(
      { sub: user.id, type: 'refresh' },
      { expiresIn: '7d' }
    );

    await fastify.prisma.authToken.create({
      data: {
        userId: user.id,
        refreshToken,
        refreshExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    reply.send({ accessToken, refreshToken });
  });
};

export default loginRoute;
