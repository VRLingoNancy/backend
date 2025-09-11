import { z } from 'zod';

export const RegisterUserRequestDto = z.object({
  email: z.email(),
  password: z.string().min(4),
  username: z.string().min(3).max(32).optional(),
  role: z.enum(['user', 'admin', 'moderator', 'tester']).optional(),
});

export type RegisterUserRequestDtoType = z.infer<typeof RegisterUserRequestDto>;
