import { createHash, randomInt } from "node:crypto";
import {
  botObservation,
  decide,
  playerView,
  seededRandom,
  transition,
  type Game,
} from "@cabo/shared";
import { db, json } from "./db.js";
import { locked, saveState } from "./game-service.js";
import type { AgentMap } from "./bot-state.js";
/** Database lock and persisted dueAt/PRNG make timers advisory, cancellable and restart-safe. */
export async function advanceBot(roomId: string) {
  return locked(roomId, async (tx) => {
    const room = await tx.room.findUniqueOrThrow({
      where: { id: roomId },
      include: { _count: { select: { bots: true } } },
    });
    if (
      !room._count.bots ||
      room.status !== "playing" ||
      !room.activeMatchId ||
      room.soloPausedAt
    )
      return {};
    const snapshot = await tx.gameSnapshot.findUniqueOrThrow({
        where: { matchId: room.activeMatchId },
      }),
      g = snapshot.state as unknown as Game,
      agents = snapshot.botState as unknown as AgentMap,
      now = Date.now();
    if (
      g.pausedAt !== undefined ||
      ["roundOver", "matchOver"].includes(g.phase)
    )
      return {};
    const actor =
      g.phase === "memory"
        ? g.players.find((p) => agents[p.id] && !p.ready)?.id
        : g.players[g.turn].id;
    const agent = actor ? agents[actor] : undefined;
    if (!actor || !agent) return {};
    const rng = seededRandom(agent.seed),
      view = playerView(g, actor);
    const observation = botObservation(view, actor, agent.memory!, now);
    if (!observation.legal.length) return {};
    if (agent.dueAt === undefined) {
      const options = room.botOptions as { fast?: boolean };
      agent.dueAt = Math.min(
        now +
          (options.fast
            ? 20
            : Math.round(
                g.phase === "memory"
                  ? Math.min(150, agent.config.delayMs)
                  : agent.config.delayMs * (0.75 + rng.next() * 0.5),
              )),
        g.phase === "memory" ? now + 3000 : g.deadline - 100,
      );
      agent.seed = rng.state;
      await tx.gameSnapshot.update({
        where: { matchId: room.activeMatchId },
        data: { botState: json(agents) },
      });
    }
    if (now < agent.dueAt) return { wakeAt: agent.dueAt };
    const decision = decide(observation, agent.config, rng.next);
    if (!decision) return {};
    agent.seed = rng.state;
    delete agent.dueAt;
    const digest = createHash("sha256")
        .update(`${room.activeMatchId}:${g.version}:${actor}`)
        .digest("hex"),
      actionId = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
    const next = transition(g, actor, decision.command, randomInt, now);
    await saveState(tx, room.activeMatchId, roomId, next, agents);
    await tx.gameAction.create({
      data: {
        matchId: room.activeMatchId,
        userId: actor,
        actionId,
        version: next.version,
        type: decision.command.type,
        round: g.round,
      },
    });
    return {
      changed: true,
      matchId: room.activeMatchId,
      wakeAt: now,
      events: next.swapHistory?.filter((e) => e.version === next.version) ?? [],
    };
  });
}
export function botController(
  publish: (
    roomId: string,
    events?: import("@cabo/shared").SwapEvent[],
    matchId?: string,
  ) => Promise<void>,
  onError: (error: unknown) => void,
) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>(),
    busy = new Set<string>(),
    dirty = new Set<string>();
  let stopped = false;
  function wake(roomId: string, at = Date.now(), force = false) {
    if (force && timers.has(roomId)) {
      clearTimeout(timers.get(roomId));
      timers.delete(roomId);
    }
    if (stopped) return;
    if (busy.has(roomId)) {
      dirty.add(roomId);
      return;
    }
    if (timers.has(roomId)) return;
    timers.set(
      roomId,
      setTimeout(
        () => {
          timers.delete(roomId);
          void pump(roomId);
        },
        Math.max(0, at - Date.now()),
      ),
    );
  }
  async function pump(roomId: string) {
    if (stopped || busy.has(roomId)) return;
    busy.add(roomId);
    let at: number | undefined;
    try {
      const result = await advanceBot(roomId);
      at = result.wakeAt;
      if (result.changed) await publish(roomId, result.events, result.matchId);
    } catch (error) {
      onError(error);
      at = Date.now() + 1000;
    } finally {
      busy.delete(roomId);
      if (dirty.delete(roomId)) at = Date.now();
      if (at !== undefined) wake(roomId, at);
    }
  }
  return {
    wake,
    stop() {
      stopped = true;
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    },
  };
}
