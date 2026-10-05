# Mis Negocios — PRD

## Overview
App móvil (iOS + Android, Expo) para gestionar múltiples negocios pequeños desde una sola interfaz. Idioma: español. Moneda principal: Lempiras (L) con opción USD por negocio.

## Core features
- **Multi-negocio**: crear, editar y eliminar negocios; selector superior tipo píldora con bottom sheet para cambiar de negocio al instante. Último negocio activo recordado en el dispositivo.
- **Perfil del negocio**: nombre, subtítulo, logo (galería/cámara, almacenado localmente), teléfono/WhatsApp, correo, dirección, redes (Facebook, Instagram, TikTok), tienda online, moneda y color principal.
- **Inventario**: productos con múltiples fotos, categoría, SKU, material, costo unitario, costos adicionales, costo total y margen de ganancia (L y %) auto-calculados, stock y stock mínimo. Alerta visual en bajo stock. Entradas de mercadería que suman stock y descuentan capital.
- **Clientes**: ficha completa (nombre, WhatsApp, correo, dirección, ciudad, red social, cumpleaños, notas). Historial de compras por cliente con total/pagado/pendiente. Botón de WhatsApp directo.
- **Ventas**: carrito con productos del negocio, cliente opcional, pago total o parcial, descuento automático de stock e ingreso registrado automáticamente.
- **Finanzas**: ledger de ingresos/egresos con categorías, capital calculado automáticamente, resumen en dashboard y pantalla dedicada.
- **Catálogo PDF**: genera un PDF con encabezado del negocio (nombre, subtítulo, contactos) + grid de productos (foto, categoría, descripción, precio) y lo comparte.

## Integrations
- **Emergent-managed Google Sign-in**: autenticación OAuth, sesión de 7 días en expo-secure-store (móvil) / localStorage (web). Datos aislados por `user_id` en MongoDB.
- **Claude Haiku 4.5** (Emergent LLM Key):
  - *Asistente AI* (`/ai-chat`): chat conversacional que recibe contexto del negocio activo (productos, bajo stock, clientes, ventas recientes, capital) y da respuestas en español.
  - *Generador de descripciones de producto*: botón "Generar con AI" en el formulario de producto que crea una descripción breve a partir de nombre, categoría y material.

## Tech
- Frontend: Expo SDK 57, expo-router, React Query, Reanimated, @gorhom/bottom-sheet, expo-image-picker (fotos locales), expo-print + expo-sharing (PDF), @react-native-vector-icons/ionicons.
- Backend: FastAPI + Motor (MongoDB). Rutas bajo `/api`. Auth con `Authorization: Bearer <session_token>`. Dependencia `require_business` para enforcing ownership.
- Diseño: iOS-Native clean, paleta champagne gold (#9D7A2A), tipografía system, iconos Ionicons. 4 tabs: Inicio, Inventario, Clientes, Más.

## Non-goals (for now)
- Sincronización offline avanzada / cola de reintentos.
- Soporte de usuarios múltiples por negocio (sólo dueño).
- Facturación fiscal / integración con DEI / impresoras POS.
