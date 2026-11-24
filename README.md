# mGBA Web Emulator

Emulador web de alto rendimiento para **Game Boy (GB)**, **Game Boy Color (GBC)** y **Game Boy Advance (GBA)** que se ejecuta directamente en el navegador mediante **WebAssembly** (`@thenick775/mgba-wasm`), con soporte multihilo, controles táctiles para móviles, mandos físicos y almacenamiento persistente local.

---

## Características Principales

### Emulación y Compatibilidad
- **Núcleo mGBA en WebAssembly**: Emulación precisa con audio y video sincronizados usando hilos de ejecución (`SharedArrayBuffer`).
- **Formatos soportados**: Archivos `.gba`, `.gbc`, `.gb` y comprimidos `.zip` / `.7z`.
- **Arrastrar y soltar (Drag & Drop)**: Arrastra tus ROMs o archivos `.sav` directamente sobre la pantalla de la consola para cargarlos al instante.
- **Encendido automático y cambio de ROM**: El núcleo se inicializa automáticamente al abrir la app y permite cambiar de juego en cualquier momento desde la barra superior.
- **Demo Homebrew integrada**: Incluye una ROM interactiva de Game Boy generada en binario puro (`src/demoRom.ts`) con desplazamiento de estrellas a 60 FPS, movimiento con cruceta, efectos de sonido y soporte de batería SRAM para probar el emulador sin archivos externos.

### Control de Juego en Tiempo Real
- **Rebobinado (Rewind)**: Retrocede la partida en tiempo real manteniendo presionada la tecla `R` o el botón de rebobinado en pantalla.
- **Velocidad variable y Modo Turbo**: Selector de velocidad (`0.5x`, `1x`, `1.5x`, `2x`, `3x`), turbo temporal a `2.5x` manteniendo la barra espaciadora y botones táctiles **Turbo A / Turbo B** de pulsación rápida continua.
- **Pausa y Reinicio en frío (Cold Boot)**: Pausa/reanuda la emulación y realiza reinicios completos desde el inicio del juego limpiando el estado de auto-guardado temporal.

### Guardado y Persistencia (`IndexedDB / IDBFS`)
- **Ranuras de guardado instantáneo (Save States)**: 3 ranuras independientes almacenadas de forma persistente en el navegador con registro de hora de guardado y atajos rápidos (`1`–`3` para guardar, `F1`–`F3` para cargar).
- **Importación y exportación de partidas `.sav`**: Exporta tus guardados nativos de batería para usarlos en RetroArch u otros emuladores de escritorio, o importa un `.sav` externo reiniciando la consola automáticamente para cargarlo.
- **Soporte para parches**: Compatible con archivos de parches `.ips`, `.bps` y `.ups`.
- **Capturas de pantalla**: Genera y descarga capturas nativas en formato `.png` directamente desde el núcleo WASM.

### Controles Multiplataforma
- **Teclado físico**: Mapeo ergonómico completo con guardián de enfoque automático en escritorio y modal de referencia rápida de atajos.
- **Mandos físicos (Gamepad API)**: Detección automática de mandos Bluetooth y USB (GameSir, Xbox, PlayStation, Nintendo Switch Pro, 8BitDo, etc.) con soporte para cruceta y stick analógico izquierdo.
- **Controles táctiles responsivos**: Interfaz táctil diseñada para teléfonos y tablets (D-Pad, `A`, `B`, `Turbo A/B`, `L`, `R`, `Start`, `Select` y `Rebobinar`), con opción de activarla también en escritorio.

### Pantalla y Audio
- **Filtros visuales retro**:
  - **Scanlines CRT** (efecto monitor de tubo con viñeta).
  - **Rejilla LCD** (simulación de matriz de píxeles estilo Game Boy Advance SP).
  - **Matrices de color**: *Original Color*, *Game Boy Green*, *Original Mono* y *Warm Hue*.
- **Modo Pantalla Completa**: Juega aprovechando todo el visor (`F` o botón en el marco de la pantalla).
- **Audio configurable**: Control de volumen de `0%` a `150%` y botón de silencio rápido (`M`).
- **Contador de FPS nativo**: Superposición opcional de la tasa de fotogramas real del núcleo.

---

## Controles y Atajos de Teclado

### Controles de Consola
| Botón GBA / GB | Tecla |
| :--- | :--- |
| **D-Pad (Movimiento)** | Flechas `↑` `↓` `←` `→` |
| **Botón A (Acción)** | `X` |
| **Botón B (Cancelar / Atrás)** | `Z` |
| **Gatillo L** | `A` |
| **Gatillo R** | `S` |
| **Start** | `Enter` |
| **Select** | `Backspace` |

### Atajos del Emulador
| Acción | Tecla |
| :--- | :--- |
| **Rebobinar** | Mantener `R` |
| **Turbo rápido (2.5x)** | Mantener `Espacio` |
| **Pausar / Reanudar** | `P` |
| **Pantalla Completa** | `F` |
| **Silenciar / Activar Audio** | `M` |
| **Guardar Ranura 1–3** | `1`, `2`, `3` |
| **Cargar Ranura 1–3** | `F1`, `F2`, `F3` |

---

## Stack Tecnológico

- **Frontend**: React 19 + TypeScript + Vite 6
- **Estilos e Iconografía**: Tailwind CSS v4 + Lucide React
- **Núcleo de Emulación**: [`@thenick775/mgba-wasm`](https://www.npmjs.com/package/@thenick775/mgba-wasm)

---

## Requisitos de Entorno y Despliegue

El núcleo multihilo de mGBA requiere **Aislamiento de Origen Cruzado (Cross-Origin Isolation)** para habilitar `SharedArrayBuffer`. El proyecto ya incluye las cabeceras necesarias tanto para desarrollo local (`vite.config.ts`) como para producción en **Vercel** (`vercel.json`):

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

> **Nota**: Si ejecutas la aplicación dentro de un `iframe` sin aislamiento de origen cruzado, la app mostrará un aviso para abrirla en una pestaña independiente.

---

## Desarrollo Local

```bash
# Instalar dependencias
npm install

# Iniciar servidor de desarrollo (puerto 3000)
npm run dev

# Verificar tipos de TypeScript
npm run lint

# Compilar para producción
npm run build
```

---

## Aviso Legal

Este proyecto no incluye ni distribuye archivos ROM comerciales con derechos de autor. Utiliza únicamente copias de seguridad legales de tus propios juegos o títulos Homebrew.
