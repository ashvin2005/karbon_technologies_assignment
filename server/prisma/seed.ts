import bcrypt from "bcryptjs";
import { PrismaClient, SplitMode } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const demoEmail = "demo@splitmint.app";
  const existing = await prisma.user.findUnique({ where: { email: demoEmail } });
  if (existing) {
    console.log("Demo user already exists, skipping seed.");
    return;
  }

  const passwordHash = await bcrypt.hash("password123", 10);
  const user = await prisma.user.create({
    data: {
      email: demoEmail,
      passwordHash
    }
  });

  const group = await prisma.group.create({
    data: {
      ownerUserId: user.id,
      name: "Demo Trip"
    }
  });

  const owner = await prisma.participant.create({
    data: {
      groupId: group.id,
      name: "You",
      avatarColor: "teal",
      isOwnerParticipant: true
    }
  });

  const alice = await prisma.participant.create({
    data: {
      groupId: group.id,
      name: "Alice",
      avatarColor: "orange",
      isOwnerParticipant: false
    }
  });

  const bob = await prisma.participant.create({
    data: {
      groupId: group.id,
      name: "Bob",
      avatarColor: "blue",
      isOwnerParticipant: false
    }
  });

  const cara = await prisma.participant.create({
    data: {
      groupId: group.id,
      name: "Cara",
      avatarColor: "green",
      isOwnerParticipant: false
    }
  });

  await prisma.expense.create({
    data: {
      groupId: group.id,
      payerParticipantId: owner.id,
      description: "Airport taxi",
      amountMinor: 10000,
      expenseDate: new Date(),
      splitMode: SplitMode.equal,
      shares: {
        create: [
          { participantId: owner.id, amountMinor: 2500, percentageBasisPoints: null },
          { participantId: alice.id, amountMinor: 2500, percentageBasisPoints: null },
          { participantId: bob.id, amountMinor: 2500, percentageBasisPoints: null },
          { participantId: cara.id, amountMinor: 2500, percentageBasisPoints: null }
        ]
      }
    }
  });

  await prisma.expense.create({
    data: {
      groupId: group.id,
      payerParticipantId: alice.id,
      description: "Dinner",
      amountMinor: 7300,
      expenseDate: new Date(),
      splitMode: SplitMode.custom,
      shares: {
        create: [
          { participantId: owner.id, amountMinor: 1800, percentageBasisPoints: null },
          { participantId: alice.id, amountMinor: 1800, percentageBasisPoints: null },
          { participantId: bob.id, amountMinor: 1900, percentageBasisPoints: null },
          { participantId: cara.id, amountMinor: 1800, percentageBasisPoints: null }
        ]
      }
    }
  });

  await prisma.expense.create({
    data: {
      groupId: group.id,
      payerParticipantId: bob.id,
      description: "Museum passes",
      amountMinor: 10100,
      expenseDate: new Date(),
      splitMode: SplitMode.percentage,
      shares: {
        create: [
          { participantId: owner.id, amountMinor: 2525, percentageBasisPoints: 2500 },
          { participantId: alice.id, amountMinor: 2525, percentageBasisPoints: 2500 },
          { participantId: bob.id, amountMinor: 2525, percentageBasisPoints: 2500 },
          { participantId: cara.id, amountMinor: 2525, percentageBasisPoints: 2500 }
        ]
      }
    }
  });

  console.log("Seed complete:", {
    email: demoEmail,
    password: "password123"
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
