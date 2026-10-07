import { useRef, useState } from "react";
import { View, Text, TextInput, StyleSheet, Pressable, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getAuthToken } from "@/src/auth-context";
import { useBusiness } from "@/src/business-context";
import { API_BASE, responseError } from "@/src/api";
import { SubHeader } from "@/src/components/top-header";
import { colors, radius, spacing } from "@/src/theme";

// `error` marks local failure notices so they are shown but never sent back to the AI as history.
type Msg = { role: "user" | "assistant"; content: string; error?: boolean };

const SUGGESTIONS = ["Resumen del negocio", "¿Qué productos están bajo stock?", "¿Qué puedo mejorar?"];

export default function AIChat() {
  const insets = useSafeAreaInsets();
  const { activeId, activeBusiness } = useBusiness();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Rendered rather than stored, so it shows the business name even if it loads after this screen.
  const greeting = `¡Hola! Soy tu asistente para ${activeBusiness?.name || "tu negocio"}. Pregúntame sobre tus ventas, stock, clientes o pide recomendaciones.`;

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || loading || !activeId) return;
    const newMsgs: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(newMsgs);
    setInput("");
    setLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/businesses/${activeId}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          message: text,
          history: messages.filter((m) => !m.error).slice(-10).map(({ role, content }) => ({ role, content })),
        }),
      });
      if (!res.ok) throw await responseError(res);
      const j = await res.json();
      setMessages([...newMsgs, { role: "assistant", content: j.reply || "..." }]);
    } catch (e: any) {
      const msg = /network request failed|failed to fetch/i.test(e?.message || "")
        ? "No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo."
        : e?.message || "No se pudo responder.";
      setMessages([...newMsgs, { role: "assistant", content: msg, error: true }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <SubHeader
        title="Asistente AI"
        subtitle={`Gemini · ${activeBusiness?.name || "tu negocio"}`}
        action={messages.length > 0 && !loading
          ? { icon: "refresh", label: "Nueva conversación", onPress: () => setMessages([]), testID: "ai-reset" }
          : undefined}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.messages}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          <AssistantBubble content={greeting} testID="msg-greeting" />
          {messages.map((m, i) =>
            m.role === "user" ? (
              <View key={i} style={[styles.bubble, styles.bubbleUser]} testID={`msg-${i}`}>
                <Text style={styles.userTxt}>{m.content}</Text>
              </View>
            ) : (
              <AssistantBubble key={i} content={m.content} error={m.error} testID={`msg-${i}`} />
            ),
          )}
          {loading && (
            <View style={styles.aiRow}>
              <AiAvatar />
              <View style={[styles.bubble, styles.bubbleAI, styles.thinking]}>
                <ActivityIndicator size="small" color={colors.onBrandSecondary} />
                <Text style={styles.thinkingTxt}>Pensando…</Text>
              </View>
            </View>
          )}
        </ScrollView>
        <View style={[styles.inputBar, { paddingBottom: Math.max(spacing.sm, insets.bottom) }]}>
          {messages.length === 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestions}>
              {SUGGESTIONS.map((s) => (
                <Pressable key={s} style={styles.chip} onPress={() => send(s)} testID={`ai-suggestion-${s}`}>
                  <Text style={styles.chipTxt}>{s}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="Escribe tu pregunta…"
              placeholderTextColor={colors.muted}
              multiline
              testID="ai-input"
            />
            <Pressable
              style={[styles.sendBtn, (!input.trim() || loading) && { opacity: 0.4 }]}
              onPress={() => send(input)}
              disabled={!input.trim() || loading}
              testID="ai-send"
              accessibilityLabel="Enviar"
            >
              <Ionicons name="arrow-up" size={20} color={colors.onBrand} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function AiAvatar() {
  return (
    <View style={styles.avatar}>
      <Ionicons name="sparkles" size={14} color={colors.onBrandSecondary} />
    </View>
  );
}

function AssistantBubble({ content, error, testID }: { content: string; error?: boolean; testID?: string }) {
  return (
    <View style={styles.aiRow} testID={testID}>
      <AiAvatar />
      <View style={[styles.bubble, styles.bubbleAI, error && styles.bubbleError]}>
        {error
          ? <Text style={[styles.aiTxt, { color: colors.onErrorTertiary }]}>{content}</Text>
          : <ChatText text={content} />}
      </View>
    </View>
  );
}

/** Inline **bold** and *italic* spans; Gemini answers in Markdown. */
function Inline({ text, style }: { text: string; style?: any }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g).filter(Boolean);
  return (
    <Text style={[styles.aiTxt, style]}>
      {parts.map((p, i) => {
        if (p.length > 4 && p.startsWith("**") && p.endsWith("**")) return <Text key={i} style={{ fontWeight: "700" }}>{p.slice(2, -2)}</Text>;
        if (p.length > 2 && p.startsWith("*") && p.endsWith("*")) return <Text key={i} style={{ fontStyle: "italic" }}>{p.slice(1, -1)}</Text>;
        return p;
      })}
    </Text>
  );
}

/** Minimal Markdown: paragraphs, #-headings, bullet (-, *, •) and numbered lists, **bold** and *italic*. */
function ChatText({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  return (
    <View style={{ gap: 4 }}>
      {lines.map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <View key={i} style={{ height: 4 }} />;
        const heading = line.match(/^#{1,6}\s+(.*)$/);
        if (heading) return <Inline key={i} text={heading[1]} style={{ fontWeight: "700" }} />;
        const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
        if (bullet) {
          return (
            <View key={i} style={styles.listRow}>
              <Text style={styles.listMark}>•</Text>
              <View style={{ flex: 1 }}><Inline text={bullet[1]} /></View>
            </View>
          );
        }
        const numbered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
        if (numbered) {
          return (
            <View key={i} style={styles.listRow}>
              <Text style={[styles.listMark, styles.listNum]}>{numbered[1]}.</Text>
              <View style={{ flex: 1 }}><Inline text={numbered[2]} /></View>
            </View>
          );
        }
        return <Inline key={i} text={line} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surfaceSecondary },
  messages: { padding: spacing.lg, gap: spacing.md },
  aiRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, maxWidth: "92%" },
  avatar: {
    width: 28, height: 28, borderRadius: radius.sm, backgroundColor: colors.brandSecondary,
    justifyContent: "center", alignItems: "center",
  },
  bubble: { paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.lg },
  bubbleAI: {
    flexShrink: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderBottomLeftRadius: 2,
  },
  bubbleUser: { alignSelf: "flex-end", maxWidth: "85%", backgroundColor: colors.brandPrimary, borderBottomRightRadius: 2 },
  bubbleError: { backgroundColor: colors.errorTertiary, borderColor: colors.errorTertiary },
  aiTxt: { fontSize: 15, color: colors.onSurface, lineHeight: 21 },
  userTxt: { fontSize: 15, color: colors.onBrandPrimary, lineHeight: 21 },
  listRow: { flexDirection: "row", gap: 6 },
  listMark: { fontSize: 15, lineHeight: 21, color: colors.onBrandSecondary, fontWeight: "700" },
  listNum: { minWidth: 18 },
  thinking: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  thinkingTxt: { fontSize: 14, color: colors.muted },
  inputBar: {
    gap: spacing.sm, paddingTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface,
  },
  suggestions: { gap: spacing.sm, paddingHorizontal: spacing.lg },
  chip: {
    paddingHorizontal: spacing.md, height: 34, justifyContent: "center", flexShrink: 0,
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  chipTxt: { color: colors.onSurface, fontSize: 13, fontWeight: "600" },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, paddingHorizontal: spacing.lg },
  input: {
    flex: 1, minHeight: 46, maxHeight: 110,
    paddingHorizontal: spacing.md, paddingTop: 12, paddingBottom: 12,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong,
    fontSize: 15, color: colors.onSurface,
  },
  sendBtn: {
    width: 46, height: 46, borderRadius: radius.md, backgroundColor: colors.brand,
    justifyContent: "center", alignItems: "center",
  },
});
