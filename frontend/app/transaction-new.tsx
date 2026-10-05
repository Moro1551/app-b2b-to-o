import { useState } from "react";
import { View, Text, TextInput, StyleSheet, Pressable, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormScreen, Field, formStyles } from "@/src/components/form-screen";
import { api } from "@/src/api";
import { useBusiness } from "@/src/business-context";
import { colors, radius, spacing } from "@/src/theme";

export default function TransactionNew() {
  const { type: initial } = useLocalSearchParams<{ type?: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { activeId } = useBusiness();
  const [type, setType] = useState<"ingreso" | "egreso">(initial === "egreso" ? "egreso" : "ingreso");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");

  const createMut = useMutation({
    mutationFn: () => api.createTransaction(activeId!, {
      type, amount: parseFloat(amount || "0") || 0, category, description,
    }),
    onSuccess: () => { qc.invalidateQueries(); router.back(); },
  });

  const save = () => {
    const n = parseFloat(amount);
    if (!n || n <= 0) { Alert.alert("Monto inválido"); return; }
    createMut.mutate();
  };

  return (
    <FormScreen title={type === "ingreso" ? "Nuevo ingreso" : "Nuevo egreso"} onSave={save} saveLabel="Registrar">
      <Field label="Tipo">
        <View style={styles.segment}>
          {[["ingreso", "Ingreso"], ["egreso", "Egreso"]].map(([v, l]) => (
            <Pressable
              key={v}
              style={[styles.segBtn, type === v && (v === "ingreso" ? styles.segIncome : styles.segExpense)]}
              onPress={() => setType(v as any)}
              testID={`tx-type-${v}`}
            >
              <Text style={[styles.segTxt, type === v && { color: colors.onBrandPrimary }]}>{l}</Text>
            </Pressable>
          ))}
        </View>
      </Field>
      <Field label="Monto *">
        <TextInput style={formStyles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.muted} testID="tx-amount" />
      </Field>
      <Field label="Categoría">
        <TextInput style={formStyles.input} value={category} onChangeText={setCategory} placeholder="Ej. Salario, servicios..." placeholderTextColor={colors.muted} />
      </Field>
      <Field label="Descripción">
        <TextInput style={formStyles.textarea} value={description} onChangeText={setDescription} multiline placeholderTextColor={colors.muted} />
      </Field>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: "row", gap: spacing.sm },
  segBtn: {
    flex: 1, paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, alignItems: "center",
  },
  segIncome: { backgroundColor: colors.success },
  segExpense: { backgroundColor: colors.error },
  segTxt: { color: colors.onSurface, fontWeight: "600" },
});
