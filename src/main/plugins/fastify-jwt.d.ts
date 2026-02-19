import '@fastify/jwt';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      role?: string;
      type?: 'refresh';
    };
    user: {
      sub: string;
      role?: string;
      type?: 'refresh';
      iat?: number;
      exp?: number;
    };
  }
}
