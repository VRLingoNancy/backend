import { z } from 'zod';

export const StartConversationRequestDto = z.object({
  content: z
    .string()
    .min(1, { message: 'Content cannot be empty.' })
    .max(4000, { message: 'Content cannot exceed 4000 characters.' }),
});

export type StartConversationRequestDtoType = z.infer<
  typeof StartConversationRequestDto
>;
