import { z } from 'zod';

export const UpdateUserSettingsRequestDto = z
  .object({
    nativeLanguageCode: z.string().min(2).max(5).optional(),
    interfaceLanguageCode: z.string().min(2).max(5).optional(),
    preferredStudyLanguage: z.string().min(2).max(5).nullable().optional(),
    defaultIaModel: z.string().optional(),
  })
  .strip();

export type UpdateUserSettingsRequestDtoType = z.infer<
  typeof UpdateUserSettingsRequestDto
>;
