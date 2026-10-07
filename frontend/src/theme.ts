import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

// "Marino" palette (Propuesta A): navy from the app icon for primary actions, teal as accent.
const light = {
  surface: "#FFFFFF",
  onSurface: "#0B1B33",
  surfaceSecondary: "#F3F5F8",
  onSurfaceSecondary: "#0B1B33",
  surfaceTertiary: "#E9EDF2",
  onSurfaceTertiary: "#0B1B33",
  surfaceInverse: "#0B1B33",
  onSurfaceInverse: "#FFFFFF",
  muted: "#66758A",

  brand: "#0E9384",
  onBrand: "#FFFFFF",
  brandPrimary: "#00183F",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#D9F1EC",
  onBrandSecondary: "#0A7568",
  brandTertiary: "#EBF7F4",
  onBrandTertiary: "#0A7568",

  // Navy band at the top of the main tabs.
  header: "#00183F",
  onHeader: "#FFFFFF",
  onHeaderMuted: "#9DB0CC",
  headerControl: "#FFFFFF1A",
  // Teal accent that stays readable on the navy header.
  onHeaderAccent: "#5EEAD4",
  headerAccentSoft: "#0E938433",

  success: "#16884A",
  onSuccess: "#FFFFFF",
  successTertiary: "#DFF3E7",
  warning: "#B86E00",
  onWarning: "#FFFFFF",
  warningTertiary: "#FCEFD7",
  error: "#C8352E",
  onError: "#FFFFFF",
  errorTertiary: "#FBE5E3",
  onErrorTertiary: "#A12A24",
  info: "#66758A",
  onInfo: "#FFFFFF",

  border: "#D3DAE3",
  borderStrong: "#AEB9C8",
  divider: "#E3E8EE",
};

export type ThemeColors = typeof light;

export const defaultScheme = "light" satisfies ColorScheme;
export const themes: { light: ThemeColors; dark?: ThemeColors } = { light };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}
setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme =
    (system === "light" || system === "dark") && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

// Moderate corners: no pills or large circles.
export const radius = {
  sm: 6,
  md: 8,
  lg: 10,
};

export const colors = light;
