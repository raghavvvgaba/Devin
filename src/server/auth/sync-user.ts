import { currentUser } from "@clerk/nextjs/server";

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

export async function syncCurrentUser() {
  const user = await currentUser();
  if (!user) {
    throw new Error("No authenticated Clerk user found during sync.");
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
}
