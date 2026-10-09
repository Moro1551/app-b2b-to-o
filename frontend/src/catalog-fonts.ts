import { Platform } from "react-native";
import { Asset } from "expo-asset";
import { File } from "expo-file-system";

// Montserrat is embedded in the catalog as data URIs: a font fetched from the web while the PDF is
// being printed may not have arrived yet, and the catalog would silently fall back to the system font.
const FACES: [number, number][] = [
  [400, require("@expo-google-fonts/montserrat/400Regular/Montserrat_400Regular.ttf")],
  [600, require("@expo-google-fonts/montserrat/600SemiBold/Montserrat_600SemiBold.ttf")],
  [700, require("@expo-google-fonts/montserrat/700Bold/Montserrat_700Bold.ttf")],
];

let cached: Promise<string> | null = null;

async function fontSrc(module: number): Promise<string> {
  const asset = await Asset.fromModule(module).downloadAsync();
  // On the web the catalog opens in a tab of the same site, so a plain URL loads fine.
  if (Platform.OS === "web") return `url("${new URL(asset.uri, window.location.href).href}")`;
  const b64 = await new File(asset.localUri || asset.uri).base64();
  return `url(data:font/ttf;base64,${b64}) format("truetype")`;
}

/** @font-face rules for the catalog, or "" if the fonts can't be read (it then uses the system font). */
export function catalogFontCss(): Promise<string> {
  cached ??= Promise.all(
    FACES.map(async ([weight, module]) =>
      `@font-face { font-family: "Montserrat"; font-weight: ${weight}; font-style: normal; src: ${await fontSrc(module)}; }`),
  )
    .then((rules) => rules.join("\n"))
    .catch((e) => {
      console.warn("catalog fonts unavailable", e);
      cached = null;
      return "";
    });
  return cached;
}
