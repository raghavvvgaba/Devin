import { currentUser } from "@clerk/nextjs/server";
import { cache } from "react";

import { db } from "~/server/db";

function getPrimaryEmail(user: Awaited<ReturnType<typeof currentUser>>) {
  if (!user) {
    throw new Error("No authenticated Clerk user found during sync.");
  }

  const primaryEmail =
    user.emailAddresses.find(
      (email) => email.id === user.primaryEmailAddressId,
    ) ?? user.emailAddresses[0];

  if (!primaryEmail) {
    throw new Error("The authenticated user does not have an email address.");
  }

  return primaryEmail.emailAddress;
}

const readCurrentUser = cache(async () => currentUser());

export const ensureUserRecord = cache(async (userId: string) => {
  const existingUser = await db.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (existingUser) {
    return existingUser;
  }

  const user = await readCurrentUser();
  if (!user) {
    throw new Error("No authenticated Clerk user found during sync.");
  }

  if (user.id !== userId) {
    throw new Error("Authenticated Clerk user does not match the requested id.");
  }

  const email = getPrimaryEmail(user);
  const fallbackName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || null;
  const name = user.fullName ?? fallbackName;

  return db.user.upsert({
    where: { id: user.id },
    update: {
      email,
      name,
    },
    create: {
      id: user.id,
      email,
      name,
    },
  });
});
