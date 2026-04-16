import '@fastify/jwt';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      role?: string;
      type?: 'refresh' | 'ws-ticket';
    };
    user: {
      sub: string;
      role?: string;
      type?: 'refresh' | 'ws-ticket';
      iat?: number;
      exp?: number;
    };
  }
}
