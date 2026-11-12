import React from "react";
import Svg, { Circle, Path } from "react-native-svg";
import { useTheme } from "./ui";
/** Original geometric portraits, bundled with the app. No network assets or user accounts. */
export function BotAvatar({ index = 0 }: { index?: number }) {
  const c = useTheme(),
    paths = [
      "M18 7 20 14 27 16 20 19 18 26 15 19 8 16 15 14Z",
      "M8 23 18 8 28 23ZM13 23 18 15 23 23",
      "M8 18Q18 2 28 18Q18 34 8 18ZM11 18H25",
      "M8 23H28M10 18H26M13 13H23",
    ];
  return (
    <Svg
      width={36}
      height={36}
      viewBox="0 0 36 36"
      accessibilityLabel="AI opponent avatar"
    >
      <Circle cx={18} cy={18} r={17} fill={c.panel} stroke={c.accent} />
      <Path
        d={paths[index % 4]}
        fill="none"
        stroke={c.accent}
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
    </Svg>
  );
}
