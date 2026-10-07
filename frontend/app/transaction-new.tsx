import { useMemo, useRef, useState } from "react";
import { View, Text, TextInput, StyleSheet, Pressable, Alert } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormScreen, Field, SectionHead, formStyles } from "@/src/components/form-screen";
import { api } from "@/src/api";
import { useBusiness } from "@/src/business-context";
import { colors, radius, spacing } from "@/src/theme";

type TxType = "ingreso" | "egreso";

// Offered until the business has its own history of categories.
const DEFAULT_CATEGORIES: Record<TxType, string[]> = {
  ingreso: ["Ventas", "Servicios", "Aporte", "Otros"],
  egreso: ["Materiales", "Envíos", "Publicidad", "Empaque", "Alquiler", "Servicios"],
};
const MAX_SUGGESTIONS = 6;

export default function TransactionNew() {
  const { type: initial } = useLocalSearchParams<{ type?: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { activeId, activeBusiness } = useBusiness();
  const [type, setType] = useState<TxType>(initial === "egreso" ? "egreso" : "ingreso");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");

  const { data: txs = [] } = useQuery({
    queryKey: ["transactions", activeId],
    queryFn: () => api.listTransactions(activeId!),
    enabled: !!activeId,
  });

  // Categories already used for this type come first, then the defaults.
  const suggestions = useMemo(() => {
    const used = txs.filter((t: any) => t.type === type && t.category).map((t: any) => t.category as string);
    const seen = new Set<string>();
    return [...used, ...DEFAULT_CATEGORIES[type]]
      .filter((c) => {
        const k = c.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, MAX_SUGGESTIONS);
  }, [txs, type]);

  const createMut = useMutation({
    mutationFn: () => api.createTransaction(activeId!, {
      type, amount: parseFloat(amount || "0") || 0, category: category.trim(), description,
    }),
    onSuccess: () => { qc.invalidateQueries(); router.back(); },
    onError: (e: any) => Alert.alert("No se pudo registrar", e?.message || "Inténtalo de nuevo."),
  });

  // isPending only updates on the next render, so two quick taps could both get through.
  const submitting = useRef(false);
  const save = () => {
    if (submitting.current) return;
    const n = parseFloat(amount);
    if (!n || n <= 0) { Alert.alert("Monto inválido"); return; }
    submitting.current = true;
    createMut.mutate(undefined, { onSettled: () => { submitting.current = false; } });
  };

  const income = type === "ingreso";
  const tint = income ? colors.success : colors.error;
  const symbol = activeBusiness?.currency === "USD" ? "$" : "L";

  return (
    <FormScreen
      title={income ? "Nuevo ingreso" : "Nuevo egreso"}
      subtitle={activeBusiness?.name}
      onSave={save}
      saveLabel={income ? "Registrar ingreso" : "Registrar egreso"}
      saving={createMut.isPending}
      grouped
    >
      <View style={styles.typeToggle}>
        {([["ingreso", "Ingreso", "arrow-down-outline"], ["egreso", "Egreso", "arrow-up-outline"]] as const).map(([v, label, icon]) => {
          const on = type === v;
          const c = v === "ingreso" ? colors.success : colors.error;
          return (
            <Pressable key={v} style={[styles.typeBtn, on && styles.typeBtnOn]} onPress={() => setType(v)} testID={`tx-type-${v}`}>
              <Ionicons name={icon} size={16} color={on ? c : colors.muted} />
              <Text style={[styles.typeTxt, on && { color: c, fontWeight: "700" }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[formStyles.card, styles.amountCard]}>
        <Text style={styles.amountLabel}>Monto *</Text>
        <View style={styles.amountRow}>
          <Text style={[styles.amountSymbol, { color: tint }]}>{income ? "+" : "−"} {symbol}</Text>
          <TextInput
            style={[styles.amountInput, { color: tint }]}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colors.borderStrong}
            autoFocus
            testID="tx-amount"
          />
        </View>
      </View>

      <SectionHead title="Categoría" />
      <View style={styles.chips}>
        {suggestions.map((c) => {
          const on = category.trim().toLowerCase() === c.toLowerCase();
          return (
            <Pressable key={c} style={[styles.chip, on && styles.chipOn]} onPress={() => setCategory(on ? "" : c)} testID={`tx-cat-${c}`}>
              <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{c}</Text>
            </Pressable>
          );
        })}
      </View>
      <Field label="O escribe otra">
        <TextInput
          style={formStyles.input}
          value={category}
          onChangeText={setCategory}
          placeholder={income ? "Ej. Ventas, servicios..." : "Ej. Materiales, alquiler..."}
          placeholderTextColor={colors.muted}
          testID="tx-category"
        />
      </Field>
      <Field label="Descripción (opcional)">
        <TextInput
          style={formStyles.textarea}
          value={description}
          onChangeText={setDescription}
          multiline
          placeholder={income ? "Ej. Pedido de la boutique" : "Ej. Compra de plata y broches"}
          placeholderTextColor={colors.muted}
          testID="tx-description"
        />
      </Field>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  typeToggle: {
    flexDirection: "row", gap: 4, padding: 4, marginBottom: spacing.md,
    backgroundColor: colors.surfaceTertiary, borderRadius: radius.md,
  },
  typeBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 10, borderRadius: radius.sm,
  },
  typeBtnOn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  typeTxt: { fontSize: 14, fontWeight: "500", color: colors.muted },
  amountCard: { padding: spacing.lg, gap: spacing.xs },
  amountLabel: { fontSize: 13, fontWeight: "600", color: colors.muted },
  amountRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  amountSymbol: { fontSize: 22, fontWeight: "700" },
  // minWidth 0: on web an <input> has an intrinsic width and would overflow the row.
  amountInput: { flex: 1, minWidth: 0, fontSize: 36, fontWeight: "800", padding: 0 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.md, height: 34, borderRadius: radius.sm, justifyContent: "center",
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipTxt: { fontSize: 13, fontWeight: "600", color: colors.muted },
  chipTxtOn: { color: colors.onBrandPrimary },
});
