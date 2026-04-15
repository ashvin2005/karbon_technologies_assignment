import { prisma } from "../prisma.js";
import { HttpError } from "../utils/httpError.js";

export async function assertOwnerAccess(groupId: string, ownerUserId: string): Promise<void> {
  const group = await prisma.group.findUnique({ where: { id: groupId }, select: { ownerUserId: true } });
  if (!group) {
    throw new HttpError(404, "Group not found");
  }

  if (group.ownerUserId !== ownerUserId) {
    throw new HttpError(403, "Forbidden");
  }
}

export async function getGroupParticipants(groupId: string) {
  return prisma.participant.findMany({ where: { groupId }, orderBy: { name: "asc" } });
}
