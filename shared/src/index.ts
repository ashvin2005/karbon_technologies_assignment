import { z } from "zod";

export type AuthUser = {
  id: string;
  email: string;
  createdAt: string;
};

export type GroupSummary = {
  id: string;
  name: string;
  ownerUserId: string;
  participantCount: number;
  ownerParticipantId: string;
  createdAt: string;
  updatedAt: string;
};

export type Participant = {
  id: string;
  groupId: string;
  name: string;
  avatarColor: string;
  isOwnerParticipant: boolean;
};

export type ExpenseShare = {
  id: string;
  expenseId: string;
  participantId: string;
  amountMinor: number;
  percentageBasisPoints: number | null;
};

export type Expense = {
  id: string;
  groupId: string;
  payerParticipantId: string;
  description: string;
  amountMinor: number;
  expenseDate: string;
  splitMode: SplitMode;
  createdAt: string;
  updatedAt: string;
  shares: ExpenseShare[];
};

export type SplitMode = "equal" | "custom" | "percentage";

export type BalanceMatrixEntry = {
  fromParticipantId: string;
  toParticipantId: string;
  amountMinor: number;
};

export type SettlementRecommendation = {
  fromParticipantId: string;
  toParticipantId: string;
  amountMinor: number;
};

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(128)
});

export const loginSchema = registerSchema;

export const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(80)
});

export const updateGroupSchema = createGroupSchema;

export const createParticipantSchema = z.object({
  name: z.string().trim().min(1).max(60),
  avatarColor: z.string().trim().min(3).max(30).default("teal")
});

export const updateParticipantSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  avatarColor: z.string().trim().min(3).max(30).optional()
}).refine((v) => Object.keys(v).length > 0, { message: "No updates provided" });

const splitMemberAmountSchema = z.object({
  participantId: z.string().cuid(),
  amountMinor: z.number().int().positive()
});

const splitMemberPercentSchema = z.object({
  participantId: z.string().cuid(),
  percentageBasisPoints: z.number().int().min(1).max(10000)
});

export const expenseCreateSchema = z.object({
  description: z.string().trim().min(1).max(160),
  amountMinor: z.number().int().positive(),
  expenseDate: z.string().datetime(),
  payerParticipantId: z.string().cuid(),
  splitMode: z.enum(["equal", "custom", "percentage"]),
  participantIds: z.array(z.string().cuid()).min(1),
  customShares: z.array(splitMemberAmountSchema).optional(),
  percentageShares: z.array(splitMemberPercentSchema).optional()
});

export const expenseUpdateSchema = expenseCreateSchema;

export const expenseFilterSchema = z.object({
  query: z.string().trim().optional(),
  participantId: z.string().cuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  minAmountMinor: z.coerce.number().int().nonnegative().optional(),
  maxAmountMinor: z.coerce.number().int().nonnegative().optional()
});

export const aiParseExpenseSchema = z.object({
  text: z.string().trim().min(1).max(500),
  groupId: z.string().cuid()
});

export const aiGroupSummarySchema = z.object({
  groupId: z.string().cuid()
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
export type CreateParticipantInput = z.infer<typeof createParticipantSchema>;
export type UpdateParticipantInput = z.infer<typeof updateParticipantSchema>;
export type ExpenseCreateInput = z.infer<typeof expenseCreateSchema>;
export type ExpenseUpdateInput = z.infer<typeof expenseUpdateSchema>;
export type ExpenseFilterInput = z.infer<typeof expenseFilterSchema>;
export type AIParseExpenseInput = z.infer<typeof aiParseExpenseSchema>;
export type AIGroupSummaryInput = z.infer<typeof aiGroupSummarySchema>;
