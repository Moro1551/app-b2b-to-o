import { Tabs } from "expo-router/js-tabs";
import { TabBar } from "@/src/components/tab-bar";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: "Inicio" }} />
      <Tabs.Screen name="inventory" options={{ title: "Inventario" }} />
      <Tabs.Screen name="customers" options={{ title: "Clientes" }} />
      <Tabs.Screen name="more" options={{ title: "Más" }} />
    </Tabs>
  );
}
