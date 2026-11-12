import React, { useState } from "react";
import { View } from "react-native";
import Slider from "@react-native-community/slider";
import { botPresets, type BotConfig } from "@cabo/shared";
import { Button, Panel, Txt, Field, Row, useTheme } from "./ui";
import { BotAvatar } from "./bot-avatar";
export const difficultyLabels = {
  beginner: "Beginner · 1",
  casual: "Casual · 3",
  intermediate: "Intermediate · 5",
  expert: "Expert · 8",
  master: "Master · 10",
  custom: "Custom",
};
const sliders: [keyof BotConfig, string, string, number, number][] = [
  ["strategy", "Strategy", "Candidate evaluation and sampling effort.", 1, 10],
  [
    "memory",
    "Memory reliability",
    "Retaining legitimately observed cards.",
    0,
    1,
  ],
  ["risk", "Risk tolerance", "Willingness to accept uncertain outcomes.", 0, 1],
  [
    "aggression",
    "Aggressiveness",
    "Value placed on increasing an opponent’s score.",
    0,
    1,
  ],
  ["cabo", "Cabo willingness", "Confidence needed before calling.", 0, 1],
  [
    "awareness",
    "Opponent awareness",
    "Weight given to opponent estimates.",
    0,
    1,
  ],
  [
    "inference",
    "Probability inference",
    "Use the remaining observed card distribution.",
    0,
    1,
  ],
  [
    "special",
    "Special-card strategy",
    "Value of information and card powers.",
    0,
    1,
  ],
  [
    "delayMs",
    "Decision delay",
    "Presentation pacing, independent of reasoning effort.",
    0,
    3000,
  ],
  ["randomness", "Decision randomness", "Variety among valid moves.", 0, 1],
];
export function BotEditor({
  name,
  avatar = 0,
  config,
  onChange,
  onSave,
  saved = [],
}: {
  name: string;
  avatar?: number;
  config: BotConfig;
  onChange: (name: string, config: BotConfig) => void;
  onSave?: (name: string) => void;
  saved?: any[];
}) {
  const c = useTheme(),
    [advanced, setAdvanced] = useState(false),
    [presetName, setPresetName] = useState("My bot");
  return (
    <Panel>
      <Row>
        <BotAvatar index={avatar} />
        <Txt size={18}>AI opponent</Txt>
      </Row>
      <Field
        label="Bot name"
        value={name}
        maxLength={24}
        onChangeText={(n) => onChange(n, config)}
      />
      <Txt size={14} muted>
        AI opponent · {difficultyLabels[config.difficulty]}
      </Txt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
        {Object.entries(botPresets).map(([key, p]) => (
          <Button
            key={key}
            title={difficultyLabels[key as keyof typeof difficultyLabels]}
            secondary={key !== config.difficulty}
            onPress={() =>
              onChange(name, { ...p, personality: config.personality })
            }
          />
        ))}
      </View>
      <Txt>Personality</Txt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
        {(
          [
            "balanced",
            "conservative",
            "aggressive",
            "analytical",
            "unpredictable",
          ] as const
        ).map((p) => (
          <Button
            key={p}
            title={p[0].toUpperCase() + p.slice(1)}
            secondary={config.personality !== p}
            onPress={() => onChange(name, { ...config, personality: p })}
          />
        ))}
      </View>
      <Button
        secondary
        title={advanced ? "Hide custom settings" : "Customize difficulty"}
        onPress={() => setAdvanced(!advanced)}
      />
      {advanced &&
        sliders.map(([key, label, description, min, max]) => (
          <View key={key} style={{ gap: 3 }}>
            <Row>
              <Txt size={14}>{label}</Txt>
              <Txt muted size={12}>
                {key === "delayMs"
                  ? `${(Number(config[key]) / 1000).toFixed(1)}s`
                  : max === 1
                    ? `${Math.round(Number(config[key]) * 100)}%`
                    : config[key]}
              </Txt>
            </Row>
            <Txt muted size={12}>
              {description}
            </Txt>
            <Slider
              accessibilityLabel={label}
              minimumValue={min}
              maximumValue={max}
              step={max === 1 ? 0.01 : 1}
              value={Number(config[key])}
              minimumTrackTintColor={c.accent}
              maximumTrackTintColor={c.line}
              thumbTintColor={c.accent}
              onSlidingComplete={(v) =>
                onChange(name, { ...config, difficulty: "custom", [key]: v })
              }
            />
          </View>
        ))}
      {advanced && onSave && (
        <>
          <Field
            label="Save configuration as"
            value={presetName}
            maxLength={40}
            onChangeText={setPresetName}
          />
          <Button
            secondary
            title="Save named configuration"
            onPress={() => onSave(presetName)}
          />
        </>
      )}
      {saved.length > 0 && (
        <View style={{ gap: 6 }}>
          <Txt muted size={12}>
            Your saved configurations
          </Txt>
          {saved.map((p) => (
            <Button
              key={p.id}
              secondary
              title={p.name}
              onPress={() => onChange(name, p.config)}
            />
          ))}
        </View>
      )}
    </Panel>
  );
}
