import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
type Prefs = {
  haptics: boolean;
  reducedMotion: boolean;
  dark: "system" | "light" | "dark";
  push: boolean;
  set: (patch: Partial<Omit<Prefs, "set">>) => void;
};
export const usePreferences = create<Prefs>((set, get) => ({
  haptics: true,
  reducedMotion: false,
  dark: "system",
  push: false,
  set: (patch) => {
    set(patch);
    const { set: _, ...prefs } = get();
    void SecureStore.setItemAsync("cabo-preferences", JSON.stringify(prefs));
  },
}));
void SecureStore.getItemAsync("cabo-preferences").then((value) => {
  if (value) {
    try {
      usePreferences.setState(JSON.parse(value));
    } catch {}
  }
});
