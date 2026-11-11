import React from "react";
import { customRules } from "@cabo/shared";
import { Screen, Title, Panel, Txt, Row } from "../src/ui";
export default function How() {
  return (
    <Screen>
      <Title
        eyebrow="My Custom Cabo · default"
        title="A little memory.\nA little nerve."
        detail="Keep the smallest hand total. A well-timed Cabo call gives everyone else one last turn."
      />
      <Panel>
        <Txt size={21}>01 · Remember two.</Txt>
        <Txt muted>
          Each player starts with four hidden cards. Select exactly two to
          inspect privately, memorize them, then tap Ready. The table begins
          after the memorization period once everyone is ready.
        </Txt>
      </Panel>
      <Panel>
        <Txt size={21}>02 · Make your move.</Txt>
        <Txt muted>
          Draw from the deck or take the top discard. Replace one of your cards,
          or try replacing several of the same rank with the drawn card. If your
          match is wrong, your cards are revealed, stay in place, your draw is
          discarded, and your turn ends.
        </Txt>
        <Txt muted>
          A deck draw can also be discarded or used for its special power. A
          card from the discard pile can only replace cards in your hand.
        </Txt>
      </Panel>
      <Panel>
        <Txt size={21}>03 · Know your powers.</Txt>
        {[
          ["7 & 8", "Peek at one of your own cards."],
          ["9 & 10", "Blindly swap one of yours with an opponent’s."],
          ["Jack & Queen", "Peek at one opponent’s card."],
          [
            "Black King",
            "Look at one opponent’s card, then choose Keep as is or Swap. If swapping, select one of yours.",
          ],
          ["Red King", "Zero points. No special power."],
          ["Ace / Joker", "One point / negative one point. No power."],
        ].map(([rank, description]) => (
          <Row key={rank}>
            <Txt style={{ fontWeight: "600" }}>{rank}</Txt>
            <Txt size={14} muted>
              {description}
            </Txt>
          </Row>
        ))}
      </Panel>
      <Panel>
        <Txt size={21}>04 · Call it.</Txt>
        <Txt muted>
          Call Cabo at the start of your turn instead of drawing. Every other
          player gets exactly one final turn. Then all cards are revealed.
        </Txt>
        <Txt muted>
          The lowest hand wins and scores zero round penalty points. Others
          receive their hand totals. An unsuccessful caller adds five points. A
          caller tied for lowest succeeds. By default, every player tied for
          lowest wins. Jokers can make hand totals negative.
        </Txt>
        <Txt muted>
          Quick Match uses raw hand scores. Longer matches accumulate round
          points. If the draw pile runs out, all discards except the top are
          securely reshuffled; if none remain, the round ends. A turn timeout
          discards a pending draw and advances. An absence beyond the configured
          grace period forfeits the match.
        </Txt>
      </Panel>
      <Panel>
        <Txt size={21}>Make it yours.</Txt>
        <Txt muted>
          Hosts can choose a preset or customize rules before play. Everyone can
          inspect those rules, and they are locked for the match. Classic
          Standard Deck uses different powers. Classic Cabo uses a numbered deck
          and the 2019 rules; see its summary before playing.
        </Txt>
        <Txt size={12} muted>
          {customRules.cards.reduce((n, c) => n + c.copies, 0)} cards · Original
          artwork · No official affiliation
        </Txt>
      </Panel>
    </Screen>
  );
}
