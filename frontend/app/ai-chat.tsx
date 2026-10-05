import { useRef, useState } from "react";
import { View, Text, TextInput, StyleSheet, Pressable, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getAuthToken } from "@/src/auth-context";
import { useBusiness } from "@/src/business-context";
import { API_BASE } from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";

type Msg = { role: "user" | "assistant"; content: string };

export default function AIChat() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeId, activeBusiness } = useBusiness();
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: `¡Hola! Soy tu asistente para ${activeBusiness?.name || "tu negocio"}. Pregúntame sobre tus ventas, stock, clientes o pide recomendaciones.` },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const send = async () => {
    const text = input.trim();
    if (!text || loading || !activeId) return;
    const newMsgs: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(newMsgs);
    setInput("");
    setLoading(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/businesses/${activeId}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: text, history: messages.slice(-10) }),
      });
      if (!res.ok) throw new Error(await res.text());
      const j = await res.json();
      setMessages([...newMsgs, { role: "assistant", content: j.reply || "..." }]);
    } catch (e: any) {
      setMessages([...newMsgs, { role: "assistant", content: "Error: " + (e?.message || "no se pudo responder") }]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  const suggestions = ["Resumen del negocio", "¿Qué productos están bajo stock?", "¿Qué puedo mejorar?"];

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}><Ionicons name="chevron-back" size={28} color={colors.onSurface} /></Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.title}>Asistente AI</Text>
          <Text style={styles.subtitle}>Claude Haiku</Text>
        </View>
        <View style={{ width: 28 }} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        >
          {messages.map((m, i) => (
            <View key={i} style={[styles.bubble, m.role === "user" ? styles.bubbleUser : styles.bubbleAI]} testID={`msg-${i}`}>
              <Text style={[styles.bubbleTxt, m.role === "user" && styles.bubbleTxtUser]}>{m.content}</Text>
            </View>
          ))}
          {loading && (
            <View style={[styles.bubble, styles.bubbleAI]}>
              <ActivityIndicator color={colors.brandPrimary} />
            </View>
          )}
        </ScrollView>
        {messages.length <= 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
            {suggestions.map((s) => (
              <Pressable key={s} style={styles.chip} onPress={() => { setInput(s); }}>
                <Text style={styles.chipTxt}>{s}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
        <View style={[styles.inputBar, { paddingBottom: Math.max(spacing.sm, insets.bottom) }]}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Escribe tu pregunta..."
            placeholderTextColor={colors.muted}
            multiline
            testID="ai-input"
          />
          <Pressable style={[styles.sendBtn, (!input.trim() || loading) && { opacity: 0.4 }]} onPress={send} disabled={!input.trim() || loading} testID="ai-send">
            <Ionicons name="arrow-up" size={20} color={colors.onBrandPrimary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  title: { fontSize: 17, fontWeight: "600", color: colors.onSurface },
  subtitle: { fontSize: 11, color: colors.muted, marginTop: 2 },
  bubble: { padding: spacing.md, borderRadius: radius.lg, maxWidth: "85%" },
  bubbleUser: { alignSelf: "flex-end", backgroundColor: colors.brandPrimary, borderBottomRightRadius: 4 },
  bubbleAI: { alignSelf: "flex-start", backgroundColor: colors.surfaceSecondary, borderBottomLeftRadius: 4 },
  bubbleTxt: { fontSize: 15, color: colors.onSurface, lineHeight: 21 },
  bubbleTxtUser: { color: colors.onBrandPrimary },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary, flexShrink: 0,
  },
  chipTxt: { color: colors.onBrandTertiary, fontSize: 13, fontWeight: "500" },
  inputBar: {
    flexDirection: "row", alignItems: "flex-end", gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 15, color: colors.onSurface,
    maxHeight: 100, minHeight: 44,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandPrimary,
    justifyContent: "center", alignItems: "center",
  },
});
