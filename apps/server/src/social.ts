import { db } from "./db.js";
import { check } from "./game-service.js";
export async function blocked(a: string, b: string) {
  return !!(await db.socialEdge.findFirst({
    where: {
      kind: "block",
      OR: [
        { fromId: a, toId: b },
        { fromId: b, toId: a },
      ],
    },
  }));
}
export async function requestFriend(fromId: string, toId: string) {
  check(fromId !== toId, "CANNOT_FRIEND_SELF");
  check(
    await db.user.findUnique({ where: { id: toId } }),
    "USER_NOT_FOUND",
    404,
  );
  check(!(await blocked(fromId, toId)), "NOT_AVAILABLE", 403);
  return db.$transaction(async (tx) => {
    // Serialize both directions to prevent crossing requests creating inconsistent friendship.
    const pair = [fromId, toId].sort().join(":");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${pair}))`;
    check(
      !(await tx.socialEdge.findFirst({
        where: {
          kind: "block",
          OR: [
            { fromId, toId },
            { fromId: toId, toId: fromId },
          ],
        },
      })),
      "NOT_AVAILABLE",
      403,
    );
    const existing = await tx.socialEdge.findFirst({
      where: {
        kind: { in: ["request", "friend"] },
        OR: [
          { fromId, toId },
          { fromId: toId, toId: fromId },
        ],
      },
    });
    check(!existing, "REQUEST_EXISTS", 409);
    return tx.socialEdge.create({ data: { fromId, toId, kind: "request" } });
  });
}
export async function respondFriend(
  userId: string,
  id: string,
  accept: boolean,
) {
  return db.$transaction(async (tx) => {
    const request = await tx.socialEdge.findUnique({ where: { id } });
    check(
      request && request.toId === userId && request.kind === "request",
      "REQUEST_NOT_FOUND",
      404,
    );
    if (accept) {
      await tx.socialEdge.createMany({
        data: [
          { fromId: request.fromId, toId: userId, kind: "friend" },
          { fromId: userId, toId: request.fromId, kind: "friend" },
        ],
        skipDuplicates: true,
      });
    }
    await tx.socialEdge.delete({ where: { id } });
  });
}

export async function blockUser(fromId: string, toId: string) {
  check(fromId !== toId, "INVALID_TARGET");
  check(
    await db.user.findUnique({ where: { id: toId } }),
    "USER_NOT_FOUND",
    404,
  );
  return db.$transaction(async (tx) => {
    const pair = [fromId, toId].sort().join(":");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${pair}))`;
    await tx.socialEdge.deleteMany({
      where: {
        kind: { in: ["friend", "request"] },
        OR: [
          { fromId, toId },
          { fromId: toId, toId: fromId },
        ],
      },
    });
    await tx.invitation.updateMany({
      where: {
        OR: [
          { fromId, toId },
          { fromId: toId, toId: fromId },
        ],
      },
      data: { revoked: true },
    });
    return tx.socialEdge.upsert({
      where: { fromId_toId_kind: { fromId, toId, kind: "block" } },
      create: { fromId, toId, kind: "block" },
      update: {},
    });
  });
}
