# SimConnect API — Reporte Técnico para MSFS 2024

## 1. ¿Qué es SimConnect?

SimConnect es la API oficial que Microsoft/Asobo proveen como parte del SDK de Microsoft Flight Simulator. Existe desde FSX (2006) y se ha mantenido como la interfaz estándar a lo largo de FSX, Prepar3D, MSFS 2020 y ahora MSFS 2024. Su propósito es permitir que programas externos (add-ons) se comuniquen con el motor de simulación: leer datos, escribir variables, disparar eventos, interceptar inputs y más.

La arquitectura es **cliente-servidor**: el simulador corre un servidor SimConnect integrado, y tu programa actúa como cliente que se conecta a él. La conexión puede ser local (mismo equipo, vía named pipes) o remota (TCP/IPv4 configurando `SimConnect.xml`).

## 2. Documentación pública oficial

**Sí, existe documentación pública completa y bien mantenida:**

| Recurso | URL |
|---------|-----|
| SDK Docs MSFS 2024 (principal) | https://docs.flightsimulator.com/msfs2024/html/1_Introduction/Introduction.htm |
| SimConnect SDK | https://docs.flightsimulator.com/msfs2024/html/6_Programming_APIs/SimConnect/SimConnect_SDK.htm |
| API Reference | https://docs.flightsimulator.com/msfs2024/html/6_Programming_APIs/SimConnect/SimConnect_API_Reference.htm |
| Simulation Variables (SimVars) | https://docs.flightsimulator.com/msfs2024/html/6_Programming_APIs/SimVars/Simulation_Variables.htm |
| Event IDs | Sección dedicada dentro de Programming APIs |
| DevSupport Forum | https://devsupport.flightsimulator.com |
| FSDeveloper Forum | https://www.fsdeveloper.com/forum/tags/simconnect/ |

El SDK se instala activando el **Developer Mode** dentro del simulador, y además incluye proyectos de ejemplo en Visual Studio (como el *SimvarWatcher*, que sirve para monitorear y editar SimVars en tiempo real).

## 3. Modos de ejecución

SimConnect permite dos formas de crear add-ons:

### Out-of-process (recomendado)
Tu aplicación corre como un `.exe` independiente. Es el método recomendado por Microsoft porque si tu programa crashea, no se cae el simulador. Soporta C, C++, y cualquier lenguaje .NET (C#, VB.NET). Es más fácil de debuggear y permite construir interfaces gráficas complejas.

### In-process (WASM)
Módulos compilados a WebAssembly que corren dentro del proceso del simulador. Se escriben en C++ y permiten acceder a funciones internas del "Gauge API" que no están expuestas vía SimConnect estándar (por ejemplo, variables locales "L:", eventos "H:", y código RPN). La desventaja es que un error puede tumbar todo el simulador.

## 4. Qué se puede leer y modificar

### Simulation Variables (SimVars)
Son cientos de variables organizadas en categorías. Muchas son de lectura y escritura:

| Categoría | Ejemplos |
|-----------|----------|
| Posición y movimiento | Latitud, longitud, altitud, velocidad, aceleración, heading, bank, pitch |
| Motores | RPM, fuel flow, EGT, throttle position, mixture, propeller, ignition |
| Superficies de control | Aileron, elevator, rudder, flaps, spoilers, trim |
| Autopilot | AP on/off, heading bug, altitude hold, V/S, approach mode, NAV mode |
| Instrumentos | Altímetro, indicador de velocidad, VOR, ADF, DME, HSI |
| Radios (COM/NAV) | Frecuencias activas y standby, volumen, ident |
| GPS/Flight plan | Waypoints, distancia al siguiente WP, ETE, cross-track error, bearing |
| Iluminación | Luces de navegación, landing, taxi, strobe, beacon, panel, cabin |
| Sistemas | Eléctrico, hidráulico, presurización, anti-ice, oxígeno |
| Peso y balance | Fuel quantity, payload, CG |
| Clima y entorno | Temperatura, presión, viento, visibilidad, precipitación |
| Simulación | Sim rate, sim on ground, sim time, pause state |
| Tren de aterrizaje | Gear position, brake, parking brake, steering |

### Event IDs (Key Events)
Permiten disparar acciones como si el usuario presionara controles:

- `SIM_RATE_INCR` / `SIM_RATE_DECR` — Controlar velocidad de simulación
- `PAUSE_ON` / `PAUSE_OFF` / `PAUSE_TOGGLE`
- `AUTOPILOT_ON` / `AUTOPILOT_OFF`
- `AP_HDG_HOLD`, `AP_ALT_HOLD`, `AP_VS_HOLD`
- `THROTTLE_SET`, `MIXTURE_SET`, `PROP_PITCH_SET`
- `FLAPS_INCR`, `FLAPS_DECR`
- `GEAR_TOGGLE`, `PARKING_BRAKES`
- Frecuencias de radio, transponder, luces, etc.

### Variables extendidas (vía WASM / WASimCommander)
Accesibles solo in-process o a través de un intermediario WASM:

- **L: vars** — Variables locales definidas por cada avión/addon (PMDG, FBW, etc.)
- **H: events** — Eventos HTML/JS de los instrumentos de cabina
- **K: events** — Key events con funcionalidad extendida (MobiFlight)
- **Código RPN** — Calculator code que puede ejecutarse directamente

## 5. Tecnologías y lenguajes soportados

### Soporte oficial (SDK directo)

| Lenguaje | Tipo | Notas |
|----------|------|-------|
| C/C++ nativo | Out-of-process | Vinculando `SimConnect.lib` + `SimConnect.h`. Plataforma x64. |
| C# / .NET | Out-of-process | Via `Microsoft.FlightSimulator.SimConnect.dll` (managed wrapper). Requiere .NET Framework 4.7+. Funciona también con .NET 8 con adaptaciones. |
| C++ → WASM | In-process | Para módulos que corren dentro del sim. Compilación con Clang/wasm-ld incluido en el SDK. |

### Librerías de terceros (comunidad)

| Librería | Lenguaje | Repo |
|----------|----------|------|
| **node-simconnect** | Node.js / TypeScript | github.com/EvenAR/node-simconnect |
| **msfs-simconnect-api-wrapper** | Node.js | github.com/Pomax/msfs-simconnect-api-wrapper |
| **Python-SimConnect** | Python | pypi.org/project/SimConnect/ |
| **FsConnect** | C# / .NET | github.com/c-true/FsConnect |
| **FSimAdapter20_24** | C# / .NET | github.com/bm98/FSimAdapter20_24 |
| **WASimCommander** | C++/.NET/Python | github.com/mpaperno/WASimCommander |

## 6. Compatibilidad MSFS 2020 ↔ 2024

Microsoft diseñó la transición para que sea lo más fluida posible. No hay cambios que rompan la compatibilidad de forma severa. Los puntos clave son:

- Recompilar contra el header del SDK 2024 para habilitar las funciones nuevas.
- Un módulo compilado con el SDK 2020 es detectado como legado y funciona sin las nuevas features.
- El cambio más notable es que `SIMCONNECT_ICAO` y estructuras relacionadas aumentaron el tamaño del campo `ident` a 8 caracteres (para helipuertos).
- Existe un adaptador comunitario (`FSimAdapter20_24`) que permite que una sola app C# funcione con ambas versiones sin recompilación separada.

## 7. Stack recomendado para tu proyecto

Dado que querés crear un programa integral que abarque todas las capacidades de SimConnect (lectura de SimVars, escritura, envío de eventos, controles automatizados como sim rate), y tomando como referencia que SimRateBandit está hecho en C# con WPF, la recomendación es:

### Stack principal: C# + .NET + WPF/MAUI

| Componente | Tecnología | Justificación |
|------------|------------|---------------|
| **Lenguaje** | C# | Soporte oficial de primera clase vía managed DLL. Ecosistema rico para UI. La mayoría de los addons de referencia (SimRateBandit, FsConnect, FSUIPC Client) están en C#. |
| **Runtime** | .NET 8+ | Moderno, performante. Requiere cargar las DLLs de SimConnect manualmente o usar FSimAdapter. Alternativa segura: .NET Framework 4.7 (soporte directo oficial). |
| **UI Desktop** | WPF | Maduro, estable, ideal para paneles complejos con data binding reactivo. SimRateBandit usa WPF. |
| **UI alternativa** | .NET MAUI / Avalonia | Si querés soporte cross-platform o un look más moderno. |
| **Conexión a SimConnect** | SDK directo o FsConnect | `Microsoft.FlightSimulator.SimConnect.dll` para acceso completo. `FsConnect` como wrapper simplificado. |
| **Variables L:/H:** | WASimCommander Client | Para acceder a variables locales de aviones complejos (PMDG, FBW, etc.) desde tu app out-of-process. |
| **Arquitectura** | MVVM | Patrón natural en WPF. Separa la lógica de SimConnect de la UI. |
| **Automatización** | System.Timers / Reactive Extensions | Para polling de SimVars y lógica de control automático (como el auto-travel de SimRateBandit). |

### Stack alternativo: Node.js + Electron

| Componente | Tecnología |
|------------|------------|
| Lenguaje | TypeScript |
| SimConnect | node-simconnect + msfs-simconnect-api-wrapper |
| UI | Electron + React/Vue |

Ventaja: UI web moderna. Desventaja: dependencia de una reimplementación no oficial del protocolo SimConnect (no usa la DLL oficial), y el overhead de Electron.

### Stack alternativo: Python

| Componente | Tecnología |
|------------|------------|
| Lenguaje | Python 3.x (64-bit) |
| SimConnect | Python-SimConnect (PyPI) |
| UI | PyQt6 / Tkinter / Flask (web) |

Ventaja: prototipado rápido. Desventaja: la librería Python es un wrapper limitado, no cubre toda la API, y no es ideal para apps interactivas complejas según experiencias de la comunidad.

## 8. Arquitectura sugerida para tu app

```
┌──────────────────────────────────────────────────┐
│                   Tu Aplicación                   │
├──────────────────────────────────────────────────┤
│  UI Layer (WPF/MAUI)                             │
│  ├── Dashboard principal (SimVars en tiempo real) │
│  ├── Panel de Sim Rate (auto-travel)             │
│  ├── Panel de Autopilot                          │
│  ├── Panel de Radios/NAV                         │
│  ├── Panel de Sistemas                           │
│  └── Panel de Clima/Entorno                      │
├──────────────────────────────────────────────────┤
│  ViewModel Layer (MVVM)                          │
│  ├── SimVarViewModel (polling + notificación)    │
│  ├── AutomationEngine (reglas de control)        │
│  └── EventDispatcher (envío de Key Events)       │
├──────────────────────────────────────────────────┤
│  Service Layer                                   │
│  ├── SimConnectService (conexión, data defs)     │
│  ├── WASimService (L:vars, H:events vía WASM)   │
│  └── FlightPlanService (parsing de waypoints)    │
├──────────────────────────────────────────────────┤
│  SimConnect DLL   │   WASimCommander Client DLL  │
└────────┬──────────┴──────────────┬───────────────┘
         │    Named Pipe / TCP     │
         ▼                         ▼
┌──────────────────────────────────────────────────┐
│          Microsoft Flight Simulator 2024          │
│  ┌─────────────┐    ┌──────────────────────┐     │
│  │  SimConnect  │    │  WASimCommander WASM │     │
│  │   Server     │    │     Module           │     │
│  └─────────────┘    └──────────────────────┘     │
└──────────────────────────────────────────────────┘
```

## 9. Implementación del control de Sim Rate

Basándote en lo que hace SimRateBandit, los elementos clave son:

**SimVars a leer:**
- `SIMULATION RATE` — Tasa actual de simulación
- `GPS WP DISTANCE` — Distancia al próximo waypoint
- `GPS WP NEXT ID` — Identificador del siguiente WP
- `GPS WP PREV DISTANCE` — Distancia al WP anterior
- `GPS FLIGHT PLAN WP COUNT` — Total de waypoints
- `GPS FLIGHT PLAN WP INDEX` — Índice del WP actual
- `GPS WP CROSS TRK` — Cross-track error (desviación lateral)
- `AUTOPILOT MASTER` — Si el AP está activo
- `INDICATED ALTITUDE` — Altitud
- `AIRSPEED INDICATED` — Velocidad

**Key Events a enviar:**
- `SIM_RATE_INCR` — Incrementar sim rate
- `SIM_RATE_DECR` — Decrementar sim rate

**Lógica de automatización:**
1. Con AP activo y en crucero, incrementar sim rate gradualmente (2x → 4x → 8x → 16x).
2. Monitorear cross-track error: si supera un umbral, reducir sim rate para que el AP corrija.
3. A cierta distancia del siguiente waypoint (ej: pocos NM), reducir para permitir el giro.
4. A cierta distancia del waypoint final (ej: 15 NM), volver a 1x para la aproximación.
5. Opcional: anunciar cambios por voz con `System.Speech.Synthesis`.

## 10. Primeros pasos concretos

1. **Instalar el SDK**: Activar Developer Mode en MSFS 2024, descargar el SDK desde el menú de desarrollador.
2. **Abrir el ejemplo SimvarWatcher**: Es un proyecto C# incluido en el SDK que ya conecta, lee y muestra SimVars. Es tu punto de partida ideal.
3. **Crear un proyecto Console C# nuevo**: Referenciar `Microsoft.FlightSimulator.SimConnect.dll` y `SimConnect.dll` del SDK.
4. **Implementar conexión básica**: Abrir SimConnect, registrar las SimVars que necesitás, y empezar a recibir datos en un timer.
5. **Agregar envío de eventos**: Usar `SimConnect_TransmitClientEvent` para enviar `SIM_RATE_INCR/DECR`.
6. **Construir la UI**: WPF con data binding a tus ViewModels.
7. **Agregar WASimCommander**: Cuando necesites acceder a L:vars de aviones complejos.

## 11. Recursos clave

| Recurso | Descripción |
|---------|-------------|
| SimRateBandit (referencia) | github.com/dga711/msfs-simratebandit |
| simrate_control (Python, referencia) | github.com/daheise/simrate_control |
| WASimCommander | github.com/mpaperno/WASimCommander |
| FsConnect (wrapper C#) | github.com/c-true/FsConnect |
| FSimAdapter 20/24 | github.com/bm98/FSimAdapter20_24 |
| node-simconnect | github.com/EvenAR/node-simconnect |
| Python-SimConnect | pypi.org/project/SimConnect/ |
| SimConnect Inspector | Herramienta de debug integrada en DevMode de MSFS |
| SimVar Watcher | Proyecto de ejemplo del SDK (C#, Visual Studio) |

---

*Reporte generado en abril 2026. La documentación oficial del SDK de MSFS 2024 es la fuente de verdad más actualizada para cualquier detalle específico de la API.*
