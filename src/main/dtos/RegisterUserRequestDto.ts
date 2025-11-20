import { z } from 'zod';

export const RegisterUserRequestDto = z.object({
  email: z.string().email(),
  password: z.string().min(4),
  username: z.string().min(3).max(32).optional(),
  nativeLanguage: z.string().min(2).max(5), // e.g., 'en', 'fr-FR'
  studyLanguage: z.string().min(2).max(5),
});

export type RegisterUserRequestDtoType = z.infer<typeof RegisterUserRequestDto>;
