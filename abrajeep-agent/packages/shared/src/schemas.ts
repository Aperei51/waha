import { z } from 'zod';
import { DOCUMENT_AUDIENCES, USER_ROLES } from './roles';

/** Telefone E.164 sem "+" (padrão do WhatsApp Cloud API), 8 a 15 dígitos. */
export const phoneSchema = z
  .string()
  .regex(/^\d{8,15}$/, 'Telefone deve conter apenas dígitos (formato E.164 sem "+")');

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export const createUserSchema = z.object({
  name: z.string().min(2).max(120),
  phone: phoneSchema,
  email: z.string().email().optional(),
  organizationId: z.string().uuid().optional(),
  dealershipId: z.string().uuid().optional(),
  jobTitle: z.string().max(120).optional(),
  role: z.enum(USER_ROLES).default('VISITOR'),
  password: z.string().min(8).max(128).optional(),
});

export const updateUserSchema = createUserSchema.partial();

export const createOrganizationSchema = z.object({
  name: z.string().min(2).max(160),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/),
  cnpj: z
    .string()
    .regex(/^\d{14}$/)
    .optional(),
});

export const createDealershipSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(2).max(160),
  code: z.string().min(2).max(40),
  city: z.string().max(80).optional(),
  state: z.string().length(2).optional(),
});

export const documentMetadataSchema = z.object({
  title: z.string().min(2).max(200),
  categoryId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  dealershipId: z.string().uuid().optional(),
  ownerArea: z.string().max(120).optional(),
  audience: z.enum(DOCUMENT_AUDIENCES).default('INTERNAL'),
});

export const knowledgeSearchSchema = z.object({
  query: z.string().min(2).max(500),
  categoryId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(20).default(5),
});

export const feedbackSchema = z.object({
  conversationId: z.string().uuid().optional(),
  rating: z.number().int().min(1).max(5).optional(),
  comment: z.string().max(2000).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type DocumentMetadataInput = z.infer<typeof documentMetadataSchema>;
