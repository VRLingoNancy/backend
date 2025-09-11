import { z } from 'zod';

export const LoginUserRequestDto = z
  .object({
    email: z.string().email().optional(),
    username: z.string().min(3).max(32).optional(),
    password: z.string().min(4),
  })
  .refine((data) => data.email || data.username, {
    message: 'Either email or username must be provided',
    path: ['email', 'username'],
  });

export type LoginUserRequestDtoType = z.infer<typeof LoginUserRequestDto>;
