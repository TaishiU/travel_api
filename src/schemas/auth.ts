import { z } from 'zod';

export const RegisterSchema = z.object({
    email: z.email(),
    password: z.string().min(8),
    displayName: z.string().min(1).max(50).optional(),
});

export const LoginSchema = z.object({
    email: z.email(),
    password: z.string().min(1),
});

export const RefreshSchema = z.object({
    refreshToken: z.string().min(1),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type RefreshInput = z.infer<typeof RefreshSchema>;