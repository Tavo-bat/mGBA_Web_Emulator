import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Gamepad2,
  Upload,
  Power,
  Pause,
  Play,
  RotateCcw,
  Download,
  Camera,
  Volume2,
  Volume1,
  VolumeX,
  Sliders,
  CheckCircle,
  Circle,
  Save,
  Layers,
  Monitor,
  Info,
  Keyboard,
  Smartphone,
  Maximize,
  Minimize,
  Rewind,
  FastForward,
  Sparkles,
  HelpCircle,
  FileUp,
  X,
  FolderOpen,
  ExternalLink,
  Wand2
} from 'lucide-react';
import mGBA, { type mGBAEmulator } from '@thenick775/mgba-wasm';
import { generateHomebrewDemoRom } from './demoRom';
import { CheatsModal } from './components/CheatsModal';
import {
  type CheatEntry,
  exportCheatsAsFile,
  generateCheatId,
  getRomBaseName,
  loadCheatsForRom,
  parseCheatsFile,
  saveStoredCheats,
  syncCheatsToCore
} from './utils/cheats';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const savInputRef = useRef<HTMLInputElement>(null);
  const patchInputRef = useRef<HTMLInputElement>(null);
  const initializingRef = useRef(false);

  // Detectar si es un celular / dispositivo táctil
  const isTouchOrMobile = typeof window !== 'undefined' && (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    ('ontouchstart' in window) ||
    navigator.maxTouchPoints > 0
  );

  // Estados de carga e interfaz
  const [emulatorReady, setEmulatorReady] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [romLoaded, setRomLoaded] = useState(false);
  const [emulator, setEmulator] = useState<mGBAEmulator | null>(null);
  const [isIsolatedError, setIsIsolatedError] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [romName, setRomName] = useState('');
  const [currentRomPath, setCurrentRomPath] = useState('');

  // Estados de personalización y control
  const [volume, setVolumeState] = useState(100); // 0% a 150%
  const [isMuted, setIsMuted] = useState(false);
  const [speed, setSpeedState] = useState(1); // 0.5, 1, 1.5, 2, 3
  const [isTurboActive, setIsTurboActive] = useState(false);
  const [isRewinding, setIsRewinding] = useState(false);
  const [useCrt, setUseCrt] = useState(true); // Scanlines CRT
  const [useLcdGrid, setUseLcdGrid] = useState(false); // Rejilla LCD opcional
  const [colorFilter, setColorFilter] = useState<'none' | 'gb-green' | 'grayscale' | 'warm'>('none');
  const [fpsCounter, setFpsCounter] = useState(false);
  const [isCanvasFocused, setIsCanvasFocused] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControlsModal, setShowControlsModal] = useState(false);
  const [showCheatsModal, setShowCheatsModal] = useState(false);
  const [cheats, setCheats] = useState<CheatEntry[]>([]);
  const [forceShowTouchControls, setForceShowTouchControls] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [gamepadConnected, setGamepadConnected] = useState<string | null>(null);

  const isAnyModalOpen = showCheatsModal || showControlsModal;
  const currentRomId = romLoaded ? getRomBaseName(currentRomPath || romName) : '';
  const activeCheatsCount = cheats.filter((c) => c.enabled).length;

  // Estados de Ranuras de Guardado (Save States)
  const [availableSlots, setAvailableSlots] = useState<Record<number, boolean>>({
    1: false,
    2: false,
    3: false
  });
  const [slotMetadata, setSlotMetadata] = useState<Record<number, string>>({});

  // Cleanup al desmontar
  const turboIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    return () => {
      if (turboIntervalRef.current) clearInterval(turboIntervalRef.current);
      if (emulator) {
        try {
          emulator.quitMgba();
        } catch (e) {
          console.warn('mGBA core shutdown inside cleanup:', e);
        }
      }
    };
  }, [emulator]);

  // Inicializar núcleo mGBA WebAssembly
  const initEmulator = useCallback(async (): Promise<mGBAEmulator | null> => {
    if (emulator) return emulator;
    if (!canvasRef.current || initializingRef.current) return null;

    if (!window.crossOriginIsolated) {
      setIsIsolatedError(true);
      return null;
    }

    try {
      initializingRef.current = true;
      setIsInitializing(true);
      setStatusMessage('Encendiendo núcleo mGBA WebAssembly...');
      const module = await mGBA({ canvas: canvasRef.current });
      await module.FSInit();

      // Aplicar volumen por defecto
      module.setVolume(volume / 100);

      setEmulator(module);
      setEmulatorReady(true);
      setIsInitializing(false);
      setStatusMessage('');
      console.log(`${module.version.projectName} ${module.version.projectVersion} listo.`);
      return module;
    } catch (error) {
      console.error('Error al inicializar mGBA:', error);
      setIsInitializing(false);
      initializingRef.current = false;
      setStatusMessage('Error al inicializar. Pulsa Encender Consola para reintentar.');
      return null;
    }
  }, [emulator, volume]);

  // Auto-encender la consola al montar el componente (como recomienda la documentación oficial de mGBA-wasm)
  useEffect(() => {
    if (!window.crossOriginIsolated) {
      setIsIsolatedError(true);
      return;
    }
    if (canvasRef.current && !emulator && !initializingRef.current) {
      initEmulator();
    }
  }, [emulator, initEmulator]);

  // Monitorizar cambios de pantalla completa
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, []);

  // Monitorizar eventos de conexión de mandos físicos
  useEffect(() => {
    const handleGamepadConnected = (e: GamepadEvent) => {
      const name = e.gamepad.id || 'Mando Físico Genérico';
      setGamepadConnected(name);
      setStatusMessage(`Mando detectado: ${name.slice(0, 28)}`);
      setTimeout(() => setStatusMessage(''), 4000);
    };

    const handleGamepadDisconnected = () => {
      setGamepadConnected(null);
      setStatusMessage('Mando desconectado.');
      setTimeout(() => setStatusMessage(''), 3000);
    };

    window.addEventListener('gamepadconnected', handleGamepadConnected);
    window.addEventListener('gamepaddisconnected', handleGamepadDisconnected);

    if (navigator.getGamepads) {
      const gp = navigator.getGamepads();
      for (let i = 0; i < gp.length; i++) {
        if (gp[i]) {
          setGamepadConnected(gp[i]!.id);
          break;
        }
      }
    }

    return () => {
      window.removeEventListener('gamepadconnected', handleGamepadConnected);
      window.removeEventListener('gamepaddisconnected', handleGamepadDisconnected);
    };
  }, []);

  // Escanear ranuras de guardado en el VFS para verificar cuáles existen
  const scanSaveSlots = useCallback(() => {
    if (!emulator || !romLoaded) return;
    try {
      const paths = emulator.filePaths();
      const saveStateDir = paths.saveStatePath;
      if (emulator.FS.analyzePath(saveStateDir).exists) {
        const files = emulator.FS.readdir(saveStateDir) as string[];
        const slots: Record<number, boolean> = { 1: false, 2: false, 3: false };
        const meta: Record<number, string> = {};

        for (let slot = 1; slot <= 3; slot++) {
          slots[slot] = files.some(
            (f) =>
              f.toLowerCase().includes(`ss${slot}`) ||
              f.toLowerCase().includes(`state${slot}`) ||
              f.toLowerCase().endsWith(`.ss${slot}`) ||
              f.toLowerCase().endsWith(`${slot}`)
          );

          if (slots[slot]) {
            const savedTime = localStorage.getItem(`mgba_slot_${romName}_${slot}`);
            meta[slot] = savedTime || 'Guardado disponible';
          }
        }
        setAvailableSlots(slots);
        setSlotMetadata(meta);
      }
    } catch (e) {
      console.warn('Error al escanear estados guardados:', e);
    }
  }, [emulator, romLoaded, romName]);

  // Escanear al cargar ROM
  useEffect(() => {
    if (romLoaded && emulator) {
      scanSaveSlots();
    }
  }, [romLoaded, emulator, scanSaveSlots]);

  // Bucle de lectura de Gamepad (Gamepad API) para mandos físicos
  useEffect(() => {
    if (!emulator || !romLoaded) return;

    let animationFrameId: number;

    const prevButtonState: Record<string, boolean> = {
      'Up': false,
      'Down': false,
      'Left': false,
      'Right': false,
      'A': false,
      'B': false,
      'L': false,
      'R': false,
      'Select': false,
      'Start': false,
    };

    const updateGamepad = () => {
      if (!emulator || !romLoaded || isPaused || isAnyModalOpen) {
        animationFrameId = requestAnimationFrame(updateGamepad);
        return;
      }

      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      let activeGamepad: Gamepad | null = null;

      for (let i = 0; i < gamepads.length; i++) {
        if (gamepads[i]) {
          activeGamepad = gamepads[i];
          break;
        }
      }

      if (activeGamepad) {
        const currentButtonState = {
          'Up': false,
          'Down': false,
          'Left': false,
          'Right': false,
          'A': false,
          'B': false,
          'L': false,
          'R': false,
          'Select': false,
          'Start': false,
        };

        const buttons = activeGamepad.buttons;
        if (buttons) {
          if (buttons[0]?.pressed || buttons[2]?.pressed) {
            currentButtonState['B'] = true;
          }
          if (buttons[1]?.pressed || buttons[3]?.pressed) {
            currentButtonState['A'] = true;
          }
          if (buttons[4]?.pressed) currentButtonState['L'] = true;
          if (buttons[5]?.pressed) currentButtonState['R'] = true;
          if (buttons[8]?.pressed) currentButtonState['Select'] = true;
          if (buttons[9]?.pressed) currentButtonState['Start'] = true;
          if (buttons[12]?.pressed) currentButtonState['Up'] = true;
          if (buttons[13]?.pressed) currentButtonState['Down'] = true;
          if (buttons[14]?.pressed) currentButtonState['Left'] = true;
          if (buttons[15]?.pressed) currentButtonState['Right'] = true;
        }

        const axes = activeGamepad.axes;
        if (axes && axes.length >= 2) {
          const axisX = axes[0];
          const axisY = axes[1];
          if (axisX < -0.4) currentButtonState['Left'] = true;
          if (axisX > 0.4) currentButtonState['Right'] = true;
          if (axisY < -0.4) currentButtonState['Up'] = true;
          if (axisY > 0.4) currentButtonState['Down'] = true;
        }

        Object.keys(currentButtonState).forEach((btn) => {
          const isPressed = currentButtonState[btn as keyof typeof currentButtonState];
          const wasPressed = prevButtonState[btn];
          if (isPressed !== wasPressed) {
            if (isPressed) {
              emulator.buttonPress(btn);
            } else {
              emulator.buttonUnpress(btn);
            }
            prevButtonState[btn] = isPressed;
          }
        });
      }

      animationFrameId = requestAnimationFrame(updateGamepad);
    };

    animationFrameId = requestAnimationFrame(updateGamepad);
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [emulator, romLoaded, isPaused, isAnyModalOpen]);

  // Cargar y aplicar automáticamente los trucos guardados de una ROM al cargarla o reiniciarla
  const applySavedCheatsForRom = useCallback(async (core: mGBAEmulator, romPath: string) => {
    const romId = getRomBaseName(romPath);
    const loadedCheats = loadCheatsForRom(core, romId);
    setCheats(loadedCheats);

    if (loadedCheats.length > 0) {
      const result = await syncCheatsToCore(core, romId, loadedCheats);
      if (result.ok && result.activeCount > 0) {
        setStatusMessage(
          `${result.activeCount} ${result.activeCount === 1 ? 'truco activo aplicado' : 'trucos activos aplicados'}`
        );
        setTimeout(() => setStatusMessage(''), 3000);
      }
    }
  }, []);

  // Guardar y sincronizar trucos en caliente con mGBA (`/data/cheats` + `autoLoadCheats`)
  const persistAndSyncCheats = useCallback(
    async (nextCheats: CheatEntry[], feedbackMessage?: string) => {
      if (!emulator || !romLoaded || !currentRomId) return;

      setCheats(nextCheats);
      saveStoredCheats(currentRomId, nextCheats);

      const result = await syncCheatsToCore(emulator, currentRomId, nextCheats);
      if (result.ok) {
        if (feedbackMessage) {
          setStatusMessage(feedbackMessage);
          setTimeout(() => setStatusMessage(''), 3000);
        }
      } else {
        setStatusMessage('Error al sincronizar trucos con el núcleo mGBA.');
        setTimeout(() => setStatusMessage(''), 4000);
      }
    },
    [emulator, romLoaded, currentRomId]
  );

  const handleAddCheat = useCallback(
    async (name: string, code: string) => {
      const now = Date.now();
      const newCheat: CheatEntry = {
        id: generateCheatId(),
        name,
        code,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      };
      await persistAndSyncCheats([newCheat, ...cheats], `Truco "${name}" añadido y activado.`);
    },
    [cheats, persistAndSyncCheats]
  );

  const handleUpdateCheat = useCallback(
    async (id: string, name: string, code: string) => {
      const now = Date.now();
      const nextCheats = cheats.map((c) =>
        c.id === id ? { ...c, name, code, updatedAt: now } : c
      );
      await persistAndSyncCheats(nextCheats, `Truco "${name}" actualizado.`);
    },
    [cheats, persistAndSyncCheats]
  );

  const handleToggleCheat = useCallback(
    async (id: string) => {
      const target = cheats.find((c) => c.id === id);
      if (!target) return;
      const nextEnabled = !target.enabled;
      const nextCheats = cheats.map((c) =>
        c.id === id ? { ...c, enabled: nextEnabled, updatedAt: Date.now() } : c
      );
      await persistAndSyncCheats(
        nextCheats,
        nextEnabled ? `Truco "${target.name}" activado.` : `Truco "${target.name}" desactivado.`
      );
    },
    [cheats, persistAndSyncCheats]
  );

  const handleDeleteCheat = useCallback(
    async (id: string) => {
      const target = cheats.find((c) => c.id === id);
      const nextCheats = cheats.filter((c) => c.id !== id);
      await persistAndSyncCheats(
        nextCheats,
        target ? `Truco "${target.name}" eliminado.` : 'Truco eliminado.'
      );
    },
    [cheats, persistAndSyncCheats]
  );

  const handleImportCheatsFile = useCallback(
    async (file: File) => {
      if (!emulator || !romLoaded || !currentRomId) return;
      try {
        const text = await file.text();
        const imported = parseCheatsFile(text);
        if (imported.length === 0) {
          setStatusMessage('El archivo .cheats no contiene códigos válidos.');
          setTimeout(() => setStatusMessage(''), 3500);
          return;
        }
        const merged = [...imported, ...cheats];
        await persistAndSyncCheats(
          merged,
          `¡${imported.length} ${imported.length === 1 ? 'truco importado' : 'trucos importados'} y aplicados!`
        );
      } catch (err) {
        console.error('Error al importar .cheats:', err);
        setStatusMessage('Error al leer el archivo .cheats.');
        setTimeout(() => setStatusMessage(''), 3500);
      }
    },
    [emulator, romLoaded, currentRomId, cheats, persistAndSyncCheats]
  );

  const handleExportCheatsFile = useCallback(() => {
    if (!romLoaded || !currentRomId || cheats.length === 0) return;
    exportCheatsAsFile(currentRomId, cheats);
    setStatusMessage(`Archivo ${currentRomId}.cheats exportado.`);
    setTimeout(() => setStatusMessage(''), 3000);
  }, [romLoaded, currentRomId, cheats]);

  // Abrir modal de cheats cancelando rewind/turbo activos para evitar teclas atascadas
  const openCheatsModal = useCallback(() => {
    if (emulator) {
      if (isRewinding) {
        emulator.toggleRewind(false);
        setIsRewinding(false);
      }
      if (isTurboActive) {
        emulator.setFastForwardMultiplier(speed);
        setIsTurboActive(false);
      }
    }
    setShowCheatsModal(true);
  }, [emulator, isRewinding, isTurboActive, speed]);

  // Desactivar entrada SDL2 del núcleo WASM cuando un modal o campo de texto está activo
  useEffect(() => {
    if (!emulator) return;

    const isEditableElement = (el: Element | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    };

    if (isAnyModalOpen) {
      emulator.toggleInput(false);
      return;
    }

    const handleFocusIn = (e: FocusEvent) => {
      if (isEditableElement(e.target as Element | null)) {
        emulator.toggleInput(false);
      }
    };

    const handleFocusOut = () => {
      requestAnimationFrame(() => {
        if (!isEditableElement(document.activeElement)) {
          emulator.toggleInput(true);
        }
      });
    };

    if (!isEditableElement(document.activeElement)) {
      emulator.toggleInput(true);
    }

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    let focusTimer: ReturnType<typeof setTimeout> | undefined;
    if (romLoaded && !isEditableElement(document.activeElement)) {
      focusTimer = setTimeout(() => {
        canvasRef.current?.focus();
        setIsCanvasFocused(true);
      }, 50);
    }

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
      if (focusTimer) clearTimeout(focusTimer);
    };
  }, [emulator, isAnyModalOpen, romLoaded]);

  // Procesar y ejecutar un archivo ROM
  const processRomFile = async (file: File) => {
    let core = emulator;
    if (!core) {
      core = await initEmulator();
      if (!core) return;
    }

    setStatusMessage(`Subiendo e instalando ${file.name}...`);

    if (romLoaded) {
      try {
        core.quitGame();
      } catch (e) {
        console.warn('Aviso cerrando juego previo:', e);
      }
    }

    core.uploadRom(file, () => {
      try {
        if (!core) return;
        const paths = core.filePaths();
        const romPath = `${paths.gamePath}/${file.name}`;

        const success = core.loadGame(romPath);
        if (success) {
          setCurrentRomPath(romPath);
          setRomLoaded(true);
          setIsRunning(true);
          setIsPaused(false);
          setRomName(file.name.replace(/\.[^.]+$/, ''));
          setStatusMessage('');
          void applySavedCheatsForRom(core, romPath);

          setTimeout(() => {
            canvasRef.current?.focus();
            setIsCanvasFocused(true);
          }, 300);
        } else {
          setStatusMessage('No se pudo iniciar el juego. Asegúrate de usar un archivo .gba, .gbc o .gb válido.');
        }
      } catch (err) {
        console.error('Error al cargar la ROM:', err);
        setStatusMessage('Error crítico al instanciar juego: ' + String(err));
      }
    });
  };

  // Subir y ejecutar ROM de juego desde input
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    processRomFile(file);
    event.target.value = '';
  };

  // Cargar la demo Homebrew interactiva integrada
  const loadDemoRom = async () => {
    let core = emulator;
    if (!core) {
      core = await initEmulator();
      if (!core) return;
    }

    try {
      setStatusMessage('Cargando Demo Homebrew...');
      if (romLoaded) {
        try {
          core.quitGame();
        } catch (_) {}
      }

      const demoBytes = generateHomebrewDemoRom();
      const paths = core.filePaths();
      const demoPath = `${paths.gamePath}/mgba_homebrew_demo.gb`;

      core.FS.writeFile(demoPath, demoBytes);
      const success = core.loadGame(demoPath);

      if (success) {
        setCurrentRomPath(demoPath);
        setRomLoaded(true);
        setIsRunning(true);
        setIsPaused(false);
        setRomName('Demo Homebrew (GB)');
        setStatusMessage('¡Demo iniciada! Usa el D-pad para mover la nave, A y B para efectos.');
        void applySavedCheatsForRom(core, demoPath);

        setTimeout(() => {
          canvasRef.current?.focus();
          setIsCanvasFocused(true);
        }, 300);
      } else {
        setStatusMessage('No se pudo iniciar la demo.');
      }
    } catch (err) {
      console.error('Error al cargar la demo:', err);
      setStatusMessage('Error al cargar demo: ' + String(err));
    }
    setTimeout(() => setStatusMessage(''), 4000);
  };

  // Alternar pausa
  const togglePause = useCallback(() => {
    if (!emulator || !romLoaded) return;
    if (isPaused) {
      emulator.resumeGame();
      setIsPaused(false);
      setStatusMessage('Juego reanudado.');
    } else {
      emulator.pauseGame();
      setIsPaused(true);
      setStatusMessage('Emulación pausada.');
    }
    setTimeout(() => setStatusMessage(''), 2500);
  }, [emulator, romLoaded, isPaused]);

  // Alternar pantalla completa
  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.warn('Error al alternar pantalla completa:', err);
    }
  }, []);

  // Silenciar / Desilenciar
  const toggleMute = useCallback(() => {
    if (isMuted) {
      setIsMuted(false);
      if (emulator) emulator.setVolume(volume / 100);
      setStatusMessage(`Audio activado (${volume}%)`);
    } else {
      setIsMuted(true);
      if (emulator) emulator.setVolume(0);
      setStatusMessage('Audio silenciado');
    }
    setTimeout(() => setStatusMessage(''), 2000);
  }, [isMuted, volume, emulator]);

  // Reiniciar juego (Cold Reset / Power Cycle completo para cargar SRAM de .sav)
  const resetGame = async () => {
    if (!emulator || !romLoaded) return;

    if (currentRomPath) {
      try {
        setStatusMessage('Reiniciando consola (Cold Boot)...');

        emulator.quitGame();

        if (emulator.autoSaveStateName && emulator.FS.analyzePath(emulator.autoSaveStateName).exists) {
          try {
            emulator.FS.unlink(emulator.autoSaveStateName);
          } catch (e) {
            console.warn('Error eliminando autosave para cold reset:', e);
          }
        }

        await emulator.FSSync();

        const success = emulator.loadGame(currentRomPath);
        if (success) {
          setIsPaused(false);
          setStatusMessage('¡Juego reiniciado desde el principio!');
          void applySavedCheatsForRom(emulator, currentRomPath);
        } else {
          emulator.quickReload();
          setIsPaused(false);
          setStatusMessage('Consola reiniciada.');
        }
      } catch (err) {
        console.error('Error al reiniciar en frío:', err);
        emulator.quickReload();
        setIsPaused(false);
        setStatusMessage('Consola reiniciada de forma rápida.');
      }
    } else {
      emulator.quickReload();
      setIsPaused(false);
      setStatusMessage('Consola reiniciada.');
    }
    setTimeout(() => setStatusMessage(''), 3000);
  };

  // Descarga del guardado tradicional (.sav) nativo de la batería del juego
  const downloadSaveFile = () => {
    if (!emulator || !romLoaded) return;

    try {
      setStatusMessage('Extrayendo bloque de memoria guardada...');

      const saveBytes = emulator.getSave();

      if (!saveBytes || saveBytes.length === 0) {
        setStatusMessage('Sin datos guardados. Guarda dentro del juego primero para generarlo.');
        setTimeout(() => setStatusMessage(''), 5000);
        return;
      }

      const blob = new Blob([saveBytes], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${romName || 'partida'}.sav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStatusMessage('¡Archivo de guardado .sav descargado con éxito!');
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (err) {
      console.error('Error al descargar la partida:', err);
      setStatusMessage('Error al exportar save: ' + String(err));
    }
  };

  // Importar archivo de guardado tradicional externo (.sav)
  const handleSavUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !emulator || !romLoaded) return;

    setStatusMessage('Cargando partida .sav en el VFS...');

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        if (e.target?.result && emulator.saveName) {
          const rawData = new Uint8Array(e.target.result as ArrayBuffer);

          emulator.quitGame();
          emulator.FS.writeFile(emulator.saveName, rawData);

          if (emulator.autoSaveStateName && emulator.FS.analyzePath(emulator.autoSaveStateName).exists) {
            try {
              emulator.FS.unlink(emulator.autoSaveStateName);
            } catch (e) {
              console.warn('Error eliminando autosave durante inyección .sav:', e);
            }
          }

          await emulator.FSSync();

          if (currentRomPath) {
            const success = emulator.loadGame(currentRomPath);
            if (success) {
              setIsPaused(false);
              setStatusMessage('¡Archivo .sav importado con éxito! Se inició el juego con tu partida.');
              void applySavedCheatsForRom(emulator, currentRomPath);
            } else {
              emulator.quickReload();
              setStatusMessage('Partida importada. Se reinició la consola de forma rápida.');
            }
          } else {
            emulator.quickReload();
            setStatusMessage('Partida importada. Se reinició la consola de forma rápida.');
          }

          setTimeout(() => setStatusMessage(''), 4500);
        } else {
          setStatusMessage('No se pudo procesar el archivo .sav provisto.');
        }
      } catch (err) {
        console.error('Error al importar sav:', err);
        setStatusMessage('Error al inyectar partida: ' + String(err));
      }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = '';
  };

  // Subir parche IPS/UPS/BPS
  const handlePatchUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !emulator) return;

    try {
      setStatusMessage(`Aplicando parche ${file.name}...`);
      emulator.uploadPatch(file, () => {
        setStatusMessage(`¡Parche "${file.name}" cargado en VFS!`);
        setTimeout(() => setStatusMessage(''), 4000);
      });
    } catch (err) {
      console.error('Error al aplicar parche:', err);
      setStatusMessage('Fallo al aplicar parche: ' + String(err));
    }
    event.target.value = '';
  };

  // Drag & Drop en la pantalla
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'sav') {
      if (!emulator || !romLoaded) {
        setStatusMessage('Carga una ROM antes de importar un archivo .sav');
        setTimeout(() => setStatusMessage(''), 3500);
        return;
      }
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      if (savInputRef.current) {
        savInputRef.current.files = dataTransfer.files;
        handleSavUpload({ target: savInputRef.current } as React.ChangeEvent<HTMLInputElement>);
      }
    } else if (ext === 'cheats') {
      if (!emulator || !romLoaded) {
        setStatusMessage('Carga una ROM antes de importar un archivo .cheats');
        setTimeout(() => setStatusMessage(''), 3500);
        return;
      }
      void handleImportCheatsFile(file);
    } else if (['gba', 'gbc', 'gb', 'zip', '7z'].includes(ext || '')) {
      processRomFile(file);
    } else {
      setStatusMessage('Formato no soportado. Usa .gba, .gbc, .gb, .sav o .cheats');
      setTimeout(() => setStatusMessage(''), 3500);
    }
  };

  // Guardar Estado Instantáneo (Save State) por Slot
  const handleSaveState = useCallback(async (slot: number) => {
    if (!emulator || !romLoaded) return;
    try {
      setStatusMessage(`Guardando estado en la ranura ${slot}...`);
      const success = emulator.saveState(slot);
      if (success) {
        await emulator.FSSync();
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        localStorage.setItem(`mgba_slot_${romName}_${slot}`, timeStr);
        setStatusMessage(`¡Ranura de guardado ${slot} persistida! (${timeStr})`);
        scanSaveSlots();
      } else {
        setStatusMessage(`La ranura ${slot} rechazó la captura instantánea.`);
      }
    } catch (e) {
      console.error(e);
      setStatusMessage(`Fallo de save state: ${String(e)}`);
    }
    setTimeout(() => setStatusMessage(''), 3000);
  }, [emulator, romLoaded, romName, scanSaveSlots]);

  // Cargar Estado Instantáneo (Load State) por Slot
  const handleLoadState = useCallback((slot: number) => {
    if (!emulator || !romLoaded) return;
    try {
      setStatusMessage(`Leyendo bloque instantáneo ${slot}...`);
      const success = emulator.loadState(slot);
      if (success) {
        setIsPaused(false);
        setStatusMessage(`¡Estado cargado de la ranura ${slot}!`);
      } else {
        setStatusMessage(`La ranura ${slot} parece no tener un guardado válido.`);
      }
    } catch (e) {
      console.error(e);
      setStatusMessage(`Fallo al restaurar: ${String(e)}`);
    }
    setTimeout(() => setStatusMessage(''), 3000);
  }, [emulator, romLoaded]);

  // Atajos de teclado globales
  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isAnyModalOpen || isTypingTarget(e.target)) return;

      if (romLoaded && emulator) {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
          e.preventDefault();
        }

        if (e.code === 'Space' && !e.repeat) {
          emulator.setFastForwardMultiplier(2.5);
          setIsTurboActive(true);
        }

        if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !e.repeat) {
          emulator.toggleRewind(true);
          setIsRewinding(true);
        }

        if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey && !e.repeat) {
          togglePause();
        }

        if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.repeat) {
          toggleFullscreen();
        }

        if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.repeat) {
          toggleMute();
        }

        if (e.code === 'Digit1' && !e.repeat) handleSaveState(1);
        if (e.code === 'Digit2' && !e.repeat) handleSaveState(2);
        if (e.code === 'Digit3' && !e.repeat) handleSaveState(3);

        if (e.code === 'F1') { e.preventDefault(); handleLoadState(1); }
        if (e.code === 'F2') { e.preventDefault(); handleLoadState(2); }
        if (e.code === 'F3') { e.preventDefault(); handleLoadState(3); }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (isAnyModalOpen || isTypingTarget(e.target)) return;

      if (e.code === 'Space' && emulator) {
        emulator.setFastForwardMultiplier(speed);
        setIsTurboActive(false);
      }
      if ((e.key === 'r' || e.key === 'R') && emulator) {
        emulator.toggleRewind(false);
        setIsRewinding(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [romLoaded, emulator, speed, isAnyModalOpen, togglePause, toggleFullscreen, toggleMute, handleSaveState, handleLoadState]);

  // Configurar volumen de juego
  const changeVolume = (elementVal: number) => {
    setVolumeState(elementVal);
    if (isMuted) setIsMuted(false);
    if (emulator) {
      emulator.setVolume(elementVal / 100);
    }
  };

  // Multiplicadores de Fast Forward (Velocidad de emulación)
  const changeSpeed = (targetSpeed: number) => {
    setSpeedState(targetSpeed);
    if (emulator) {
      emulator.setFastForwardMultiplier(targetSpeed);
      setStatusMessage(`Velocidad configurada en: ${targetSpeed}x`);
      setTimeout(() => setStatusMessage(''), 2000);
    }
  };

  // Control manual de Rebobinado (Hold to Rewind)
  const startRewind = () => {
    if (!emulator || !romLoaded) return;
    emulator.toggleRewind(true);
    setIsRewinding(true);
  };

  const stopRewind = () => {
    if (!emulator || !romLoaded) return;
    emulator.toggleRewind(false);
    setIsRewinding(false);
  };

  // Cambiar visualización del contador nativo FPS
  const toggleFps = () => {
    const nextVal = !fpsCounter;
    setFpsCounter(nextVal);
    if (emulator) {
      emulator.setCoreSettings({ showFpsCounter: nextVal });
    }
  };

  // Capturar screenshot del núcleo (WASM) y descargar
  const captureScreenshot = () => {
    if (!emulator || !romLoaded) return;

    try {
      setStatusMessage('Capturando instantánea retro...');
      const fileName = `screenshot_${Date.now()}.png`;
      const ok = emulator.screenshot(fileName);

      if (ok) {
        const paths = emulator.filePaths();
        const screenshotPath = `${paths.screenshotsPath}/${fileName}`;

        if (emulator.FS.analyzePath(screenshotPath).exists) {
          const rawBytes = emulator.FS.readFile(screenshotPath);
          const blob = new Blob([rawBytes], { type: 'image/png' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${romName || 'mgba'}_screenshot.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          setStatusMessage('¡Captura descargada con éxito!');
        } else {
          setStatusMessage('Captura no encontrada en el disco del emulador.');
        }
      } else {
        setStatusMessage('Fallo al tomar la captura.');
      }
    } catch (e) {
      console.error('Error al capturar pantalla:', e);
      setStatusMessage('Error al capturar: ' + String(e));
    }
    setTimeout(() => setStatusMessage(''), 3000);
  };

  // API para botones en pantallas táctiles
  const bindTouch = (name: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      emulator?.buttonPress(name);
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.preventDefault();
      emulator?.buttonUnpress(name);
    },
    onPointerLeave: (e: React.PointerEvent) => {
      e.preventDefault();
      emulator?.buttonUnpress(name);
    }
  });

  // Botón Turbo para botones A o B en táctil
  const bindTurboTouch = (name: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      if (turboIntervalRef.current) clearInterval(turboIntervalRef.current);
      let toggle = true;
      emulator?.buttonPress(name);
      turboIntervalRef.current = setInterval(() => {
        toggle = !toggle;
        if (toggle) {
          emulator?.buttonPress(name);
        } else {
          emulator?.buttonUnpress(name);
        }
      }, 55);
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.preventDefault();
      if (turboIntervalRef.current) {
        clearInterval(turboIntervalRef.current);
        turboIntervalRef.current = null;
      }
      emulator?.buttonUnpress(name);
    },
    onPointerLeave: (e: React.PointerEvent) => {
      e.preventDefault();
      if (turboIntervalRef.current) {
        clearInterval(turboIntervalRef.current);
        turboIntervalRef.current = null;
      }
      emulator?.buttonUnpress(name);
    }
  });

  // Estilo CSS de Filtro de Pantalla
  const getFilterStyle = () => {
    switch (colorFilter) {
      case 'gb-green':
        return 'contrast-[1.25] saturate-[1.6] hue-rotate-[50deg] sepia brightness-[0.85]';
      case 'grayscale':
        return 'grayscale contrast-[1.2] brightness-[1.05]';
      case 'warm':
        return 'sepia-[0.35] contrast-[1.05] saturate-[1.1]';
      default:
        return '';
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0f12] text-gray-200 flex flex-col items-center justify-between font-sans p-2 xs:p-3 sm:p-4 relative overflow-x-hidden selection:bg-purple-600/30">

      {/* Luces traseras decorativas muy tenues */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-purple-900/10 rounded-full blur-[140px] pointer-events-none -translate-y-1/2 z-0" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-pink-900/10 rounded-full blur-[140px] pointer-events-none translate-y-1/2 z-0" />

      {/* HEADER SUPERIOR */}
      <header className="w-full max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-3 py-2 border-b border-gray-800/60 mb-3 sm:mb-6 z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-tr from-purple-600 to-pink-600 rounded-xl shadow-lg shadow-purple-900/30 animate-pulse">
            <Gamepad2 className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-pink-400 to-amber-400 tracking-tight">
              mGBA Web Emulator
            </h1>
            <p className="text-[10px] text-gray-500 font-mono tracking-wider uppercase">
              Consola de Alto Rendimiento WASM
            </p>
          </div>
        </div>

        {/* BARRA DE ACCIÓN RÁPIDA SIEMPRE VISIBLE EN HEADER */}
        <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-end">
          {gamepadConnected && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/40 border border-emerald-800/40 text-emerald-400 text-[10px] font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="truncate max-w-[130px]">{gamepadConnected}</span>
            </div>
          )}

          {!emulatorReady && !isIsolatedError && (
            <button
              onClick={initEmulator}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-all text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md active:scale-95"
            >
              <Power size={14} />
              <span>Encender Consola</span>
            </button>
          )}

          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white transition-all text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md active:scale-95"
            title="Seleccionar archivo ROM (.gba, .gbc, .gb)"
          >
            <FolderOpen size={14} />
            <span>{romLoaded ? 'Cambiar ROM' : 'Cargar ROM'}</span>
          </button>

          <button
            onClick={loadDemoRom}
            className="px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 border border-purple-500/30 text-amber-300 hover:text-white transition-all text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
            title="Probar Demo Homebrew integrada"
          >
            <Sparkles size={14} className="text-amber-400" />
            <span>Demo</span>
          </button>

          <button
            onClick={openCheatsModal}
            className={`px-3 py-1.5 rounded-xl border transition-all text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 ${
              activeCheatsCount > 0
                ? 'bg-purple-950/60 hover:bg-purple-900/60 border-purple-500/60 text-purple-200 shadow-purple-950/40'
                : 'bg-gray-900/60 hover:bg-gray-800 border-gray-800 text-purple-300 hover:text-white'
            }`}
            title="Gestionar trucos (Cheats) para la ROM actual"
          >
            <Wand2 size={14} className="text-purple-400" />
            <span>Cheats</span>
            {romLoaded && activeCheatsCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-purple-600 text-white text-[10px] font-mono font-bold leading-none">
                {activeCheatsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setShowControlsModal(true)}
            className="p-2 rounded-xl bg-gray-900/60 hover:bg-gray-800 text-gray-400 hover:text-white border border-gray-800 transition-colors cursor-pointer text-xs flex items-center gap-1"
            title="Ver controles y atajos"
          >
            <HelpCircle size={15} />
            <span className="hidden sm:inline text-[11px] font-mono">Atajos</span>
          </button>

          {/* Notificación de Estado Flotante Integrada */}
          <div className="min-h-[34px] flex items-center px-3 py-1 rounded-full border border-gray-800/80 bg-gray-900/40 backdrop-blur-md max-w-xs">
            {statusMessage ? (
              <span className="text-xs text-amber-400 font-medium flex items-center gap-2 animate-pulse truncate">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block flex-shrink-0" />
                {statusMessage}
              </span>
            ) : (
              <span className="text-xs text-gray-400 flex items-center gap-2 truncate">
                <span className={`w-1.5 h-1.5 rounded-full inline-block flex-shrink-0 ${emulatorReady ? 'bg-emerald-500 animate-ping' : 'bg-amber-500'}`} />
                {romLoaded ? `Jugando: ${romName}` : emulatorReady ? 'Consola encendida' : 'Iniciando...'}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* PANELES DE CONTROL PRINCIPALES */}
      <main className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-8 items-start my-auto z-10">

        {/* COLUMNA PANTALLA GBA (8 de 12 col en desktop) */}
        <section className="lg:col-span-8 flex flex-col items-center gap-4">

          {/* Bezel / Gabinete de la Pantalla */}
          <div
            ref={containerRef}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`w-full relative flex flex-col items-center rounded-2xl bg-[#161920] border-2 sm:border-4 border-gray-800/80 p-2.5 sm:p-5 shadow-2xl transition-all duration-300 hover:border-purple-900/40 shadow-purple-950/20 focus-within:ring-2 focus-within:ring-purple-500/50 ${
              isFullscreen ? '!rounded-none !border-0 bg-black min-h-screen justify-center' : ''
            }`}
          >

            {/* Tira informativa con LED de Estado */}
            <div className="w-full flex items-center justify-between pb-3 mb-2 border-b border-gray-800/60 font-mono text-xs text-gray-500">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full relative">
                  <span className={`absolute inset-0 rounded-full ${
                    isRunning && !isPaused ? 'bg-blue-500 animate-ping' :
                    isPaused ? 'bg-amber-500 animate-pulse' :
                    emulatorReady ? 'bg-emerald-500 animate-pulse' : 'bg-red-600'
                  }`} />
                  <span className={`block w-2 h-2 rounded-full ${
                    isRunning && !isPaused ? 'bg-blue-400' :
                    isPaused ? 'bg-amber-400' :
                    emulatorReady ? 'bg-emerald-400' : 'bg-red-500'
                  }`} />
                </span>
                <span className="text-[10px] tracking-widest text-gray-400">
                  {isRunning && !isPaused ? (isRewinding ? 'STATUS: REWIND' : isTurboActive ? 'STATUS: TURBO' : 'STATUS: ACTIVE') :
                   isPaused ? 'STATUS: PAUSED' :
                   emulatorReady ? 'STATUS: READY' : 'STATUS: STANDBY'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {romLoaded && (
                  <>
                    <button
                      onClick={toggleMute}
                      className="p-1 text-gray-400 hover:text-white transition-colors cursor-pointer"
                      title={isMuted ? 'Activar Sonido (M)' : 'Silenciar (M)'}
                    >
                      {isMuted || volume === 0 ? <VolumeX size={14} className="text-red-400" /> : <Volume2 size={14} />}
                    </button>
                    <button
                      onMouseDown={startRewind}
                      onMouseUp={stopRewind}
                      onMouseLeave={stopRewind}
                      onTouchStart={startRewind}
                      onTouchEnd={stopRewind}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 transition-all cursor-pointer ${
                        isRewinding ? 'bg-amber-600 text-white animate-pulse' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                      }`}
                      title="Mantén presionado para rebobinar (Tecla R)"
                    >
                      <Rewind size={11} />
                      <span className="hidden sm:inline">Rebobinar</span>
                    </button>
                    <button
                      onClick={toggleFullscreen}
                      className="p-1 text-gray-400 hover:text-white transition-colors cursor-pointer"
                      title="Pantalla Completa (F)"
                    >
                      {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
                    </button>
                  </>
                )}
                <div className="text-[10px] tracking-wider text-gray-500 font-mono hidden xs:inline">
                  {romLoaded ? `${colorFilter.toUpperCase()}-MATRIX` : 'AUTO-DETECTION'}
                </div>
              </div>
            </div>

            {/* Contenedor del Canvas y Overlays (Con min-h para evitar que se recorten botones en móvil) */}
            <div className={`relative w-full aspect-[3/2] min-h-[220px] ${
              isFullscreen ? 'max-h-[90vh]' : 'max-h-[300px] xs:max-h-[340px] sm:max-h-[460px]'
            } rounded-lg overflow-hidden bg-black shadow-[inset_0_0_15px_rgba(0,0,0,0.9)] border border-gray-900 group`}>

              {/* Canvas Principal GBA */}
              <canvas
                ref={canvasRef}
                id="emulator-canvas"
                tabIndex={0}
                onFocus={() => setIsCanvasFocused(true)}
                onBlur={() => setIsCanvasFocused(false)}
                onClick={() => canvasRef.current?.focus()}
                className={`w-full h-full z-10 transition-all duration-300 image-render-pixelated cursor-pointer focus:outline-none ${
                  romLoaded ? 'opacity-100' : 'opacity-0 pointer-events-none absolute'
                } ${getFilterStyle()}`}
              />

              {/* Overlay Visual de Rejilla LCD GBA SP */}
              {romLoaded && useLcdGrid && (
                <div
                  className="absolute inset-0 pointer-events-none z-20 opacity-30 mix-blend-overlay"
                  style={{
                    backgroundImage: 'linear-gradient(to right, rgba(0,0,0,0.4) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.4) 1px, transparent 1px)',
                    backgroundSize: '3px 3px',
                  }}
                />
              )}

              {/* Filtro Scanlines CRT de Televisor */}
              {romLoaded && useCrt && (
                <div
                  className="absolute inset-0 pointer-events-none z-20 opacity-45 mix-blend-multiply"
                  style={{
                    backgroundImage: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.45) 50%)',
                    backgroundSize: '100% 4px',
                  }}
                />
              )}

              {/* Filtro de Glare y Sombra Retro CRT */}
              {romLoaded && (useCrt || useLcdGrid) && (
                <div className="absolute inset-0 pointer-events-none z-22 shadow-[inset_0_0_45px_rgba(0,0,0,0.7)] border border-white/5 opacity-80" />
              )}

              {/* Badge HUD de Rebobinado Activo */}
              {isRewinding && (
                <div className="absolute top-3 left-3 z-30 flex items-center gap-2 bg-amber-950/80 border border-amber-500 px-3 py-1 rounded-lg text-amber-300 font-mono text-xs font-bold animate-pulse shadow-lg backdrop-blur-sm">
                  <Rewind size={14} />
                  <span>REBOBINANDO...</span>
                </div>
              )}

              {/* Badge HUD de Turbo Activo */}
              {isTurboActive && (
                <div className="absolute top-3 right-3 z-30 flex items-center gap-2 bg-purple-950/80 border border-purple-500 px-3 py-1 rounded-lg text-purple-300 font-mono text-xs font-bold animate-pulse shadow-lg backdrop-blur-sm">
                  <FastForward size={14} />
                  <span>TURBO 2.5X</span>
                </div>
              )}

              {/* Overlay de Arrastrar y Soltar */}
              {isDragging && (
                <div className="absolute inset-0 z-40 bg-purple-950/90 flex flex-col items-center justify-center p-4 text-center border-2 border-dashed border-purple-400 rounded-lg animate-fade-in backdrop-blur-sm">
                  <FileUp className="w-12 h-12 text-purple-300 mb-2 animate-bounce" />
                  <h3 className="text-base font-bold text-white mb-1">Suelta tu archivo aquí</h3>
                  <p className="text-xs text-purple-300">Formatos compatibles: .gba, .gbc, .gb, .sav, .cheats</p>
                </div>
              )}

              {/* Guardián de Enfoque con Teclado */}
              {romLoaded && !isCanvasFocused && !isTouchOrMobile && !isFullscreen && !isAnyModalOpen && (
                <div
                  onClick={() => {
                    canvasRef.current?.focus();
                    setIsCanvasFocused(true);
                  }}
                  className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-[2px] z-30 cursor-pointer animate-fade-in group-hover:bg-black/60 transition-colors"
                >
                  <div className="bg-gray-900/90 border border-purple-500/40 p-4 rounded-2xl max-w-xs flex flex-col items-center text-center shadow-2xl">
                    <Keyboard className="w-8 h-8 text-purple-400 mb-2 animate-bounce" />
                    <h3 className="text-sm font-bold text-white mb-1">Teclado Desactivado</h3>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Haz clic aquí para recuperar el control de teclado y continuar jugando.
                    </p>
                  </div>
                </div>
              )}

              {/* Estado: Error de Entorno no Aislado (SharedArrayBuffer) */}
              {isIsolatedError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-3 sm:p-6 text-center bg-gray-950/95 z-30 overflow-y-auto">
                  <div className="bg-red-950/20 p-4 sm:p-6 rounded-2xl border border-red-500/50 flex flex-col items-center max-w-md shadow-xl">
                    <Power className="w-8 h-8 sm:w-11 sm:h-11 text-red-500 mb-2 animate-pulse" />
                    <h2 className="text-base sm:text-lg font-bold text-red-400 mb-1">Entorno No Aislado</h2>
                    <p className="text-[11px] sm:text-xs text-gray-300 mb-3 leading-relaxed">
                      mGBA requiere <strong>SharedArrayBuffer</strong>. Abre la aplicación en una nueva pestaña independiente para activar el motor.
                    </p>
                    <a
                      href={typeof window !== 'undefined' ? window.location.href : '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-xs transition-transform active:scale-95 shadow-lg flex items-center gap-2 cursor-pointer"
                    >
                      <ExternalLink size={14} /> Abrir en Nueva Pestaña
                    </a>
                  </div>
                </div>
              )}

              {/* PASO 1: Inicializar Subsistemas (Compacto para que nunca se recorte en pantallas pequeñas) */}
              {!emulatorReady && !isIsolatedError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-3 sm:p-6 text-center bg-[#07080a] z-20 overflow-y-auto">
                  <div className="flex flex-col items-center max-w-sm">
                    <div className="relative mb-2 sm:mb-4">
                      <div className="absolute inset-0 w-10 h-10 sm:w-14 sm:h-14 bg-emerald-500/20 rounded-full blur-[8px] animate-ping" />
                      <Power className="w-10 h-10 sm:w-14 sm:h-14 text-emerald-400 relative z-10" />
                    </div>
                    <h2 className="text-base sm:text-xl font-bold text-gray-200 mb-1">
                      {isInitializing ? 'Encendiendo mGBA Core...' : 'Inicializar mGBA Core'}
                    </h2>
                    <p className="text-[11px] sm:text-xs text-gray-400 mb-3 sm:mb-5 leading-relaxed">
                      Pulsa el botón para encender la consola o seleccionar directamente tu archivo ROM.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        onClick={initEmulator}
                        disabled={isInitializing}
                        className="px-4 py-2.5 sm:px-6 sm:py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs sm:text-sm transition-all transform active:scale-95 shadow-lg shadow-emerald-950/40 flex items-center gap-2 cursor-pointer"
                      >
                        <Power size={15} /> {isInitializing ? 'Cargando...' : 'Encender Consola Core'}
                      </button>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="px-4 py-2.5 sm:px-5 sm:py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold text-xs sm:text-sm transition-all transform active:scale-95 shadow-lg flex items-center gap-2 cursor-pointer"
                      >
                        <Upload size={15} /> Cargar ROM
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* PASO 2: Consola Encendida esperando archivo ROM (Compacto y adaptable) */}
              {emulatorReady && !romLoaded && !isIsolatedError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-3 sm:p-6 text-center bg-[#101217] z-10 overflow-y-auto">
                  <div className="p-4 sm:p-6 border-2 border-dashed border-gray-700/80 rounded-2xl bg-gray-900/30 flex flex-col items-center max-w-sm w-full">
                    <Upload className="w-8 h-8 sm:w-10 sm:h-10 text-purple-400 mb-2 animate-pulse" />
                    <h3 className="text-sm sm:text-base font-semibold text-gray-200 mb-1">Consola Encendida • Cargar ROM</h3>
                    <p className="text-[11px] sm:text-xs text-gray-400 mb-3 sm:mb-4 leading-relaxed">
                      Formatos soportados: <strong>.gba</strong>, <strong>.gbc</strong>, <strong>.gb</strong>
                    </p>
                    <div className="flex flex-row gap-2 w-full justify-center">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex-1 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold text-xs tracking-wider transition-colors shadow-md shadow-purple-950/40 cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Upload size={14} /> Cargar ROM Local
                      </button>
                      <button
                        onClick={loadDemoRom}
                        className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-amber-300 hover:text-white rounded-xl font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Sparkles size={14} /> Probar Demo
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Inputs de carga ocultos */}
            <input
              type="file"
              accept=".gba,.gbc,.gb,.zip,.7z"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
            <input
              type="file"
              accept=".sav"
              className="hidden"
              ref={savInputRef}
              onChange={handleSavUpload}
            />
            <input
              type="file"
              accept=".ips,.bps,.ups"
              className="hidden"
              ref={patchInputRef}
              onChange={handlePatchUpload}
            />
          </div>

          {/* D-PAD TÁCTIL Y CONTROLES VIRTUALES (En móviles o activado por el usuario) */}
          {romLoaded && (isTouchOrMobile || forceShowTouchControls) && (
            <div className="w-full max-w-md bg-gray-900/30 rounded-2xl p-3 xs:p-4 border border-gray-800/60 transition-all my-2 shadow-xl">

              {/* Botones de hombro L & R en panel superior */}
              <div className="flex justify-between items-center mb-3 sm:mb-4 px-1">
                <button
                  className="px-4 py-1.5 bg-gray-800 active:bg-purple-600 border border-gray-700/50 hover:bg-gray-700 text-[10px] sm:text-xs font-bold text-gray-300 rounded-lg active:scale-95 transition-all select-none shadow"
                  {...bindTouch('L')}
                >
                  L Shoulder
                </button>
                <button
                  onMouseDown={startRewind}
                  onMouseUp={stopRewind}
                  onTouchStart={startRewind}
                  onTouchEnd={stopRewind}
                  className={`px-3 py-1 rounded-lg text-[10px] font-mono flex items-center gap-1 font-bold ${
                    isRewinding ? 'bg-amber-600 text-white animate-pulse' : 'bg-gray-800 text-amber-400 border border-gray-700'
                  }`}
                >
                  <Rewind size={11} /> Rebobinar
                </button>
                <button
                  className="px-4 py-1.5 bg-gray-800 active:bg-purple-600 border border-gray-700/50 hover:bg-gray-700 text-[10px] sm:text-xs font-bold text-gray-300 rounded-lg active:scale-95 transition-all select-none shadow"
                  {...bindTouch('R')}
                >
                  R Shoulder
                </button>
              </div>

              {/* D-Pad y botones principales */}
              <div className="flex justify-between items-center w-full px-1 sm:px-2 gap-2">

                {/* D-Pad de cruceta retro */}
                <div className="relative w-[116px] h-[116px] xs:w-[130px] xs:h-[130px] sm:w-36 sm:h-36 bg-gray-950/80 rounded-full border-4 border-gray-800 shadow-xl flex items-center justify-center">
                  <button
                    className="absolute top-1 left-9 xs:left-11 sm:left-12 w-8 xs:w-9 sm:w-10 h-10 xs:h-11 sm:h-12 bg-gray-800 active:bg-purple-600 border-b border-gray-900 rounded-t-md active:scale-95 select-none"
                    {...bindTouch('Up')}
                  />
                  <button
                    className="absolute bottom-1 left-9 xs:left-11 sm:left-12 w-8 xs:w-9 sm:w-10 h-10 xs:h-11 sm:h-12 bg-gray-800 active:bg-purple-600 border-t border-gray-900 rounded-b-md active:scale-95 select-none"
                    {...bindTouch('Down')}
                  />
                  <button
                    className="absolute left-1 top-9 xs:top-11 sm:top-12 w-10 xs:w-11 sm:w-12 h-8 xs:h-9 sm:h-10 bg-gray-800 active:bg-purple-600 border-r border-gray-900 rounded-l-md active:scale-95 select-none"
                    {...bindTouch('Left')}
                  />
                  <button
                    className="absolute right-1 top-9 xs:top-11 sm:top-12 w-10 xs:w-11 sm:w-12 h-8 xs:h-9 sm:h-10 bg-gray-800 active:bg-purple-600 border-l border-gray-900 rounded-r-md active:scale-95 select-none"
                    {...bindTouch('Right')}
                  />
                  <div className="w-8 h-8 xs:w-9 xs:h-9 sm:w-10 sm:h-10 bg-gray-900 rounded-full flex items-center justify-center pointer-events-none shadow-inner" />
                </div>

                {/* Botones de acción A & B cruzados + Turbo */}
                <div className="flex flex-col gap-2 transform rotate-12 relative">
                  <div className="flex gap-2 justify-end">
                    <button
                      className="px-2 py-0.5 bg-pink-950/80 border border-pink-700/60 text-pink-300 text-[9px] font-mono font-bold rounded active:scale-95 select-none"
                      {...bindTurboTouch('B')}
                    >
                      Turbo B
                    </button>
                    <button
                      className="px-2 py-0.5 bg-purple-950/80 border border-purple-700/60 text-purple-300 text-[9px] font-mono font-bold rounded active:scale-95 select-none"
                      {...bindTurboTouch('A')}
                    >
                      Turbo A
                    </button>
                  </div>

                  <div className="flex gap-2.5 xs:gap-4">
                    <div className="flex flex-col items-center">
                      <button
                        className="w-11 h-11 xs:w-12 xs:h-12 sm:w-14 sm:h-14 bg-pink-700 active:bg-pink-500 border-2 sm:border-4 border-gray-900 rounded-full shadow-lg flex items-center justify-center font-bold text-sm sm:text-base text-white active:scale-90 transition-transform select-none"
                        {...bindTouch('B')}
                      >
                        B
                      </button>
                      <span className="text-[8px] sm:text-[9px] text-gray-500 font-mono tracking-widest mt-1 select-none">CANCEL</span>
                    </div>
                    <div className="flex flex-col items-center -mt-4 sm:-mt-6">
                      <button
                        className="w-11 h-11 xs:w-12 xs:h-12 sm:w-14 sm:h-14 bg-purple-600 active:bg-purple-400 border-2 sm:border-4 border-gray-900 rounded-full shadow-lg flex items-center justify-center font-bold text-sm sm:text-base text-white active:scale-90 transition-transform select-none"
                        {...bindTouch('A')}
                      >
                        A
                      </button>
                      <span className="text-[8px] sm:text-[9px] text-gray-500 font-mono tracking-widest mt-1 select-none">ACTION</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Botones Select & Start del centro */}
              <div className="flex justify-center gap-6 xs:gap-10 mt-4 sm:mt-6 pt-2 sm:pt-3 border-t border-gray-800/40">
                <div className="flex flex-col items-center">
                  <button
                    className="w-12 xs:w-14 sm:w-16 h-4 sm:h-5 bg-gray-800 active:bg-purple-600 border-2 border-gray-950 rounded-full shadow active:scale-90 select-none"
                    {...bindTouch('Select')}
                  />
                  <span className="text-[8px] sm:text-[9px] uppercase font-bold text-gray-500 mt-1 sm:mt-1.5 tracking-wider select-none">Select</span>
                </div>
                <div className="flex flex-col items-center">
                  <button
                    className="w-12 xs:w-14 sm:w-16 h-4 sm:h-5 bg-gray-800 active:bg-purple-600 border-2 border-gray-950 rounded-full shadow active:scale-90 select-none"
                    {...bindTouch('Start')}
                  />
                  <span className="text-[8px] sm:text-[9px] uppercase font-bold text-gray-500 mt-1 sm:mt-1.5 tracking-wider select-none">Start</span>
                </div>
              </div>

            </div>
          )}

          {/* TECLADO DE ESCRITORIO GUÍA VISUAL */}
          {emulatorReady && (
            <div className="w-full bg-[#111318]/90 border border-gray-800/60 p-5 rounded-2xl shadow-lg hidden md:block z-10 transition-colors hover:border-gray-800">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-xs font-bold font-mono uppercase text-gray-400 flex items-center gap-2">
                  <Keyboard className="w-4 h-4 text-purple-400" />
                  Guía de Teclado Físico
                </h4>
                <button
                  onClick={() => setForceShowTouchControls(!forceShowTouchControls)}
                  className="text-[10px] text-gray-400 hover:text-purple-300 font-mono flex items-center gap-1 cursor-pointer"
                >
                  <Smartphone size={12} />
                  {forceShowTouchControls ? 'Ocultar controles táctiles' : 'Mostrar controles en pantalla'}
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div className="flex items-center gap-2.5">
                  <span className="px-2 py-1 bg-gray-800 border border-gray-700 rounded shadow font-mono font-bold text-purple-400 min-w-[28px] text-center">X</span>
                  <span className="text-gray-400">Botón A (Acción)</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="px-2 py-1 bg-gray-800 border border-gray-700 rounded shadow font-mono font-bold text-pink-400 min-w-[28px] text-center">Z</span>
                  <span className="text-gray-400">Botón B (Atrás)</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="px-1.5 py-1 bg-gray-800 border border-gray-700 rounded shadow font-mono font-bold text-amber-500 min-w-[28px] text-center flex items-center justify-center text-[10px]">ENTER</span>
                  <span className="text-gray-400">Start (Menú)</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="px-1 py-1 bg-gray-800 border border-gray-700 rounded shadow font-mono font-bold text-amber-500 text-[9px] min-w-[28px] text-center text-ellipsis overflow-hidden">BACKSP</span>
                  <span className="text-gray-400">Select</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="px-2 py-1 bg-gray-800 border border-gray-700 rounded shadow font-mono font-bold text-purple-400 min-w-[28px] text-center">A</span>
                  <span className="text-gray-400">Gatillo L (Shoulder)</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="px-2 py-1 bg-gray-800 border border-gray-700 rounded shadow font-mono font-bold text-purple-400 min-w-[28px] text-center">S</span>
                  <span className="text-gray-400">Gatillo R (Shoulder)</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="px-1.5 py-1 bg-gray-800 border border-gray-700 rounded shadow font-mono font-bold text-gray-300 text-[10px] min-w-[28px] text-center">↑↓←→</span>
                  <span className="text-gray-400">D-Pad / Movilidad</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="px-1.5 py-1 bg-amber-950/60 font-mono font-black text-amber-400 border border-amber-700/40 rounded shadow text-[10px] min-w-[28px] text-center">R</span>
                  <span className="text-gray-400">Rebobinar (Mantener)</span>
                </div>
              </div>
            </div>
          )}

        </section>

        {/* COLUMNA PANEL DE CONFIGURACIÓN Y MEDIOS (4 de 12 col en desktop) */}
        <section className="lg:col-span-4 flex flex-col gap-5 w-full">

          {/* PANEL 1: CONTROLES DE LA EMULACIÓN */}
          {romLoaded && (
            <div className="rounded-2xl bg-[#161920] border border-gray-800/80 p-5 shadow-lg flex flex-col gap-4">
              <h2 className="text-sm font-bold tracking-wider font-mono text-gray-400 uppercase border-b border-gray-800/60 pb-2 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-purple-400" />
                Control de Emulación
              </h2>

              <div className="flex flex-col gap-3.5">
                <div className="flex gap-3">
                  <button
                    onClick={togglePause}
                    className="flex-1 py-2.5 bg-gray-850 hover:bg-gray-700/80 text-white rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-2 border border-gray-700/35 cursor-pointer"
                  >
                    {isPaused ? <Play size={14} className="text-emerald-400 animate-pulse" /> : <Pause size={14} className="text-amber-500" />}
                    {isPaused ? 'Reanudar' : 'Pausar'}
                  </button>
                  <button
                    onClick={resetGame}
                    className="flex-1 py-2.5 bg-gray-850 hover:bg-gray-700/80 text-white rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-2 border border-gray-700/35 cursor-pointer"
                  >
                    <RotateCcw size={14} className="text-pink-400" />
                    Resetear
                  </button>
                </div>

                {/* Panel de Velocidad de Juego */}
                <div className="flex flex-col gap-1.5 pt-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-mono uppercase text-gray-500 tracking-wider">
                      Velocidad del Juego (Turbo)
                    </label>
                    <span className="text-[9px] font-mono text-purple-400">Espacio = 2.5x</span>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[0.5, 1, 1.5, 2, 3].map((s) => (
                      <button
                        key={s}
                        onClick={() => changeSpeed(s)}
                        className={`py-1.5 rounded-lg font-bold text-[10px] transition-all cursor-pointer ${
                          speed === s
                            ? 'bg-gradient-to-tr from-purple-600 to-pink-600 text-white shadow shadow-purple-900/30'
                            : 'bg-gray-850 border border-gray-800 text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                        }`}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* Botón Rebobinar */}
                <button
                  onMouseDown={startRewind}
                  onMouseUp={stopRewind}
                  onMouseLeave={stopRewind}
                  onTouchStart={startRewind}
                  onTouchEnd={stopRewind}
                  className={`w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer select-none active:scale-95 shadow ${
                    isRewinding
                      ? 'bg-amber-600 text-white ring-2 ring-amber-400 animate-pulse'
                      : 'bg-gray-850 hover:bg-gray-800 text-amber-400 border border-amber-900/40'
                  }`}
                >
                  <Rewind size={14} />
                  <span>Mantener para Rebobinar (Tecla R)</span>
                </button>
              </div>
            </div>
          )}

          {/* PANEL 2: RANURAS DE GUARDADO DE ESTADOS (SAVE STATES) */}
          {romLoaded && (
            <div className="rounded-2xl bg-[#161920] border border-gray-800/80 p-5 shadow-lg flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-gray-800/60 pb-2">
                <h2 className="text-sm font-bold tracking-wider font-mono text-gray-400 uppercase flex items-center gap-2">
                  <Save className="w-4 h-4 text-purple-400" />
                  Ranuras instantáneas
                </h2>
                <span className="text-[10px] font-mono text-purple-400 font-bold bg-purple-950/40 px-2 py-0.5 rounded border border-purple-900/30">
                  Save States
                </span>
              </div>

              <div className="flex flex-col gap-3">
                {[1, 2, 3].map((slot) => (
                  <div
                    key={slot}
                    className="flex items-center justify-between p-3 rounded-xl bg-gray-900/40 border border-gray-800/80 hover:border-gray-700/60 transition-all group/slot"
                  >
                    <div className="flex items-center gap-2.5">
                      {availableSlots[slot] ? (
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <Circle className="w-4 h-4 text-gray-600" />
                      )}
                      <div>
                        <p className="text-xs font-bold">Ranura {slot}</p>
                        <p className="text-[9px] font-mono text-gray-500">
                          {availableSlots[slot] ? (slotMetadata[slot] || 'Guardado instantáneo disponible') : 'Ranura libre'}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleLoadState(slot)}
                        disabled={!availableSlots[slot]}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                          availableSlots[slot]
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow shadow-emerald-950/20 active:scale-95'
                            : 'bg-gray-850 text-gray-600 border border-gray-800 cursor-not-allowed'
                        }`}
                        title="Cargar Estado"
                      >
                        Cargar
                      </button>

                      <button
                        onClick={() => handleSaveState(slot)}
                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white text-[10px] font-bold rounded-lg flex items-center gap-1 transition-all active:scale-95 cursor-pointer shadow shadow-purple-950/30"
                        title="Capturar Estado"
                      >
                        Guardar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PANEL 3: AUDIO Y SHADERS / VISUALES */}
          {romLoaded && (
            <div className="rounded-2xl bg-[#161920] border border-gray-800/80 p-5 shadow-lg flex flex-col gap-4">
              <h2 className="text-sm font-bold tracking-wider font-mono text-gray-400 uppercase border-b border-gray-800/60 pb-2 flex items-center gap-2">
                <Monitor className="w-4 h-4 text-purple-400" />
                Filtros de Pantalla y Audio
              </h2>

              <div className="flex flex-col gap-4">

                {/* Control deslizante de Volumen */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center text-[10px] font-mono text-gray-500 uppercase tracking-widest">
                    <span>Volumen de Audio</span>
                    <span className="font-bold text-gray-300">{isMuted ? 'MUTE' : `${volume}%`}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={toggleMute} className="cursor-pointer">
                      {isMuted || volume === 0 ? (
                        <VolumeX size={16} className="text-gray-500" />
                      ) : volume < 50 ? (
                        <Volume1 size={16} className="text-purple-400" />
                      ) : (
                        <Volume2 size={16} className="text-purple-400 animate-pulse" />
                      )}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="150"
                      value={isMuted ? 0 : volume}
                      onChange={(e) => changeVolume(Number(e.target.value))}
                      className="flex-1 accent-purple-500 bg-gray-850 h-1.5 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>

                {/* Toggles de Filtros CRT y LCD */}
                <div className="grid grid-cols-2 gap-2 border-t border-gray-800/40 pt-3">
                  <button
                    onClick={() => setUseCrt(!useCrt)}
                    className={`py-2 px-2.5 rounded-lg text-[10px] font-bold flex items-center justify-between transition-all cursor-pointer ${
                      useCrt
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-850 border border-gray-800 text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    <span>Scanlines CRT</span>
                    <span>{useCrt ? 'ON' : 'OFF'}</span>
                  </button>

                  <button
                    onClick={() => setUseLcdGrid(!useLcdGrid)}
                    className={`py-2 px-2.5 rounded-lg text-[10px] font-bold flex items-center justify-between transition-all cursor-pointer ${
                      useLcdGrid
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-850 border border-gray-800 text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    <span>Rejilla LCD</span>
                    <span>{useLcdGrid ? 'ON' : 'OFF'}</span>
                  </button>
                </div>

                {/* Selector de Modos de Color */}
                <div className="flex flex-col gap-1.5 border-t border-gray-800/40 pt-3">
                  <span className="text-xs font-semibold">Matriz de Color (LCD)</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { id: 'none', name: 'Original Color' },
                      { id: 'gb-green', name: 'Game Boy Green' },
                      { id: 'grayscale', name: 'Original Mono' },
                      { id: 'warm', name: 'Warm Hue' }
                    ].map((filt) => (
                      <button
                        key={filt.id}
                        onClick={() => setColorFilter(filt.id as 'none' | 'gb-green' | 'grayscale' | 'warm')}
                        className={`py-1.5 rounded-lg font-bold text-[10px] transition-all cursor-pointer ${
                          colorFilter === filt.id
                            ? 'bg-gradient-to-tr from-purple-600 to-pink-600 text-white shadow shadow-purple-900/30'
                            : 'bg-gray-850 border border-gray-800 text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                        }`}
                      >
                        {filt.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mostrar FPS Nativo del core */}
                <div className="flex items-center justify-between border-t border-gray-800/40 pt-3">
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold">FPS Counter Overlay</span>
                    <span className="text-[9px] font-mono text-gray-500">Tasa nativa de frames del core</span>
                  </div>
                  <button
                    onClick={toggleFps}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                      fpsCounter
                        ? 'bg-purple-600 hover:bg-purple-500 text-white'
                        : 'bg-gray-850 border border-gray-800 text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {fpsCounter ? 'Mostrando' : 'Oculto'}
                  </button>
                </div>

              </div>
            </div>
          )}

          {/* PANEL 4: GESTION DE ARCHIVOS SAV (IMPORT & EXPORT) */}
          {romLoaded && (
            <div className="rounded-2xl bg-[#161920] border border-gray-800/80 p-5 shadow-lg flex flex-col gap-4">
              <h2 className="text-sm font-bold tracking-wider font-mono text-gray-400 uppercase border-b border-gray-800/60 pb-2 flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-400" />
                Administrador de Partidas .sav
              </h2>

              <p className="text-[10px] text-gray-400 leading-relaxed font-mono">
                Puedes exportar tu partida (.sav) para jugarla en RetroArch u otros emuladores de escritorio, o cargar tus saves existentes aquí mismo.
              </p>

              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={downloadSaveFile}
                  className="flex-1 py-2 bg-gray-850 hover:bg-gray-800 text-white text-[10px] font-bold rounded-xl flex items-center justify-center gap-2 border border-gray-700/20 active:scale-95 transition-all cursor-pointer shadow"
                >
                  <Download size={12} className="text-emerald-400" /> Exportar .sav
                </button>
                <button
                  onClick={() => savInputRef.current?.click()}
                  className="flex-1 py-2 bg-gray-850 hover:bg-gray-800 text-white text-[10px] font-bold rounded-xl flex items-center justify-center gap-2 border border-gray-700/20 active:scale-95 transition-all cursor-pointer shadow"
                >
                  <Upload size={12} className="text-purple-400" /> Importar .sav
                </button>
              </div>
            </div>
          )}

          {/* PANEL 5: HERRAMIENTAS ADICIONALES (SCREENSHOT DE CORE) */}
          {romLoaded && (
            <div className="rounded-2xl bg-[#161920] border border-gray-800/80 p-4 shadow-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-purple-400" />
                <div className="flex flex-col">
                  <span className="text-xs font-semibold">Capturar Pantalla</span>
                  <span className="text-[9px] font-mono text-gray-500">Foto nativa del núcleo WASM</span>
                </div>
              </div>
              <button
                onClick={captureScreenshot}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white text-[10px] font-bold rounded-xl transition-all shadow shadow-purple-950/30 cursor-pointer active:scale-95"
              >
                Tomar Foto
              </button>
            </div>
          )}

          {/* PANEL DE ACCESO RÁPIDO CUANDO NO HAY JUEGO CARGADO */}
          {!romLoaded && (
            <div className="rounded-2xl bg-[#161920]/80 border border-gray-800 p-5 shadow-md flex flex-col items-center text-center gap-3">
              <div className="p-3 bg-purple-950/20 rounded-full border border-purple-500/20">
                <Info size={22} className="text-purple-400" />
              </div>
              <h3 className="text-sm font-semibold text-gray-200">Acceso Rápido a Consola</h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                La consola se enciende automáticamente al abrir la página. Usa cualquiera de estos botones para empezar a jugar:
              </p>
              <div className="flex flex-col gap-2 w-full pt-1">
                {!emulatorReady && !isIsolatedError && (
                  <button
                    onClick={initEmulator}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow"
                  >
                    <Power size={14} /> Encender Consola Manualmente
                  </button>
                )}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow"
                >
                  <Upload size={14} /> Seleccionar Archivo ROM (.gba / .gbc / .gb)
                </button>
                <button
                  onClick={loadDemoRom}
                  className="w-full py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-amber-300 rounded-xl font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles size={14} /> Jugar Demo Integrada
                </button>
              </div>
            </div>
          )}

        </section>

      </main>

      {/* MODAL DE ATAJOS Y CONTROLES */}
      {showControlsModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#14171f] border border-gray-800 rounded-2xl max-w-lg w-full p-5 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <div className="flex items-center gap-2">
                <Keyboard className="w-5 h-5 text-purple-400" />
                <h3 className="text-base font-bold text-white">Guía de Teclas y Atajos</h3>
              </div>
              <button
                onClick={() => setShowControlsModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-3 max-h-[70vh] overflow-y-auto pr-1">
              <div>
                <h4 className="text-xs font-mono font-bold uppercase text-purple-400 mb-2">Controles de la Consola</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex justify-between p-2 rounded-lg bg-gray-900/60 border border-gray-800">
                    <span className="text-gray-400">Botón A</span>
                    <span className="font-mono font-bold text-purple-300">X</span>
                  </div>
                  <div className="flex justify-between p-2 rounded-lg bg-gray-900/60 border border-gray-800">
                    <span className="text-gray-400">Botón B</span>
                    <span className="font-mono font-bold text-pink-300">Z</span>
                  </div>
                  <div className="flex justify-between p-2 rounded-lg bg-gray-900/60 border border-gray-800">
                    <span className="text-gray-400">Start</span>
                    <span className="font-mono font-bold text-amber-300">Enter</span>
                  </div>
                  <div className="flex justify-between p-2 rounded-lg bg-gray-900/60 border border-gray-800">
                    <span className="text-gray-400">Select</span>
                    <span className="font-mono font-bold text-amber-300">Backspace</span>
                  </div>
                  <div className="flex justify-between p-2 rounded-lg bg-gray-900/60 border border-gray-800">
                    <span className="text-gray-400">Gatillo L</span>
                    <span className="font-mono font-bold text-purple-300">A</span>
                  </div>
                  <div className="flex justify-between p-2 rounded-lg bg-gray-900/60 border border-gray-800">
                    <span className="text-gray-400">Gatillo R</span>
                    <span className="font-mono font-bold text-purple-300">S</span>
                  </div>
                  <div className="flex justify-between p-2 rounded-lg bg-gray-900/60 border border-gray-800 col-span-2">
                    <span className="text-gray-400">Cruceta Direccional</span>
                    <span className="font-mono font-bold text-white">Flechas ↑ ↓ ← →</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-800 pt-3">
                <h4 className="text-xs font-mono font-bold uppercase text-amber-400 mb-2">Atajos de Emulador</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex justify-between p-2 rounded-lg bg-gray-900/60 border border-gray-800">
                    <span className="text-gray-400">Rebobinar</span>
                    <span className="font-mono font-bold text-amber-300">Mantener R</span>
                  </div>
                  <div className="flex justify-between p-2 rounded-lg bg-gray-900/60 border border-gray-800">
                    <span className="text-gray-400">Turbo Rápido</span>
                    <span className="font-mono font-bold text-purple-300">Mantener Espacio</span>
                  </div>
                  <div className="flex justify-between p-2 rounded-lg bg-gray-900/60 border border-gray-800">
                    <span className="text-gray-400">Pausar / Reanudar</span>
                    <span className="font-mono font-bold text-white">P</span>
                  </div>
                  <div className="flex justify-between p-2 rounded-lg bg-gray-900/60 border border-gray-800">
                    <span className="text-gray-400">Pantalla Completa</span>
                    <span className="font-mono font-bold text-white">F</span>
                  </div>
                  <div className="flex justify-between p-2 rounded-lg bg-gray-900/60 border border-gray-800">
                    <span className="text-gray-400">Silenciar / Audio</span>
                    <span className="font-mono font-bold text-white">M</span>
                  </div>
                  <div className="flex justify-between p-2 rounded-lg bg-gray-900/60 border border-gray-800">
                    <span className="text-gray-400">Guardar Ranura (1-3)</span>
                    <span className="font-mono font-bold text-emerald-300">Tecla 1, 2, 3</span>
                  </div>
                  <div className="flex justify-between p-2 rounded-lg bg-gray-900/60 border border-gray-800 col-span-2">
                    <span className="text-gray-400">Cargar Ranura (1-3)</span>
                    <span className="font-mono font-bold text-emerald-300">F1, F2, F3</span>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowControlsModal(false)}
              className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold text-xs cursor-pointer transition-colors"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* MODAL GESTOR DE CHEATS */}
      <CheatsModal
        isOpen={showCheatsModal}
        onClose={() => setShowCheatsModal(false)}
        romLoaded={romLoaded}
        romName={romName}
        cheats={cheats}
        onAddCheat={handleAddCheat}
        onUpdateCheat={handleUpdateCheat}
        onToggleCheat={handleToggleCheat}
        onDeleteCheat={handleDeleteCheat}
        onImportCheatsFile={handleImportCheatsFile}
        onExportCheatsFile={handleExportCheatsFile}
        onRequestLoadRom={() => fileInputRef.current?.click()}
      />

      {/* ADVERTENCIA DE COMPATIBILIDAD CON ENTORNO IFRAME */}
      <footer className="w-full max-w-5xl mt-12 pt-6 border-t border-gray-800/40 text-center flex flex-col sm:flex-row items-center justify-between gap-4 z-10 font-mono text-[10px] text-gray-500">
        <div className="flex items-center gap-2">
          <Smartphone size={12} className="text-purple-400" />
          <span>Controles táctiles optimizados para tablets y móviles</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="p-1 bg-yellow-950/20 text-yellow-500 rounded border border-yellow-800/35">Pestaña Nueva Recomendada</span>
          <span className="max-w-xs text-left">Presiona el ícono ⊞ del visor de AI Studio para maximizar audio y prevenir cualquier tipo de retraso.</span>
        </div>
      </footer>

    </div>
  );
}
