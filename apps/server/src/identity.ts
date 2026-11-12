import { type Prisma } from "@prisma/client";
import type { PublicIdentity } from "@cabo/shared";
import { db } from "./db.js";
export async function identities(
  ids: string[],
  tx: Prisma.TransactionClient = db,
): Promise<Record<string, PublicIdentity>> {
  const users = await tx.user.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: {
      id: true,
      name: true,
      profile: { select: { displayName: true, username: true } },
    },
  });
  return Object.fromEntries(
    ids.map((id) => {
      const u = users.find((u) => u.id === id);
      return [
        id,
        {
          userId: id,
          displayName: u?.profile?.displayName || u?.name || "Former player",
          username: u?.profile?.username ?? null,
        },
      ];
    }),
  );
}
let publish: (identity: PublicIdentity) => Promise<void> = async () => {};
export function setIdentityPublisher(fn: typeof publish) {
  publish = fn;
}
export async function publishIdentity(id: string) {
  const map = await identities([id]);
  await publish(map[id]);
}
