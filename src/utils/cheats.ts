import type { mGBAEmulator } from '@thenick775/mgba-wasm';

export interface CheatEntry {
  id: string;
  name: string;
  code: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CheatValidationResult {
  valid: boolean;
  error?: string;
  normalizedName: string;
  normalizedCode: string;
}

export interface CheatSyncResult {
  ok: boolean;
  filePath: string;
  activeCount: number;
  totalCount: number;
  error?: string;
}

const STORAGE_PREFIX = 'mgba_cheats_v1::';

/**
 * Generates a unique identifier for a cheat entry.
 */
export function generateCheatId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `cheat_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Extracts the ROM base filename (without directory or final extension)
 * matching how mGBA's mCoreAutoloadCheats resolves `<cheatsPath>/<baseName>.cheats`.
 */
export function getRomBaseName(romPathOrName: string): string {
  const cleaned = romPathOrName.trim();
  if (!cleaned) return 'game';
  const fileName = cleaned.split('/').pop() || cleaned;
  const lastDot = fileName.lastIndexOf('.');
  const baseName = lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
  return baseName.trim() || 'game';
}

/**
 * Resolves the exact VFS `.cheats` path expected by `@thenick775/mgba-wasm`
 * (`emulator.filePaths().cheatsPath` -> `/data/cheats/<baseName>.cheats`).
 */
export function getCheatsFilePath(emulator: mGBAEmulator, fallbackRomName?: string): string {
  const { cheatsPath } = emulator.filePaths();
  const baseName = getRomBaseName(emulator.gameName || fallbackRomName || 'game');
  return `${cheatsPath}/${baseName}.cheats`;
}

/**
 * Builds the localStorage persistence key scoped to a specific ROM.
 */
export function getCheatsStorageKey(romId: string): string {
  return `${STORAGE_PREFIX}${getRomBaseName(romId)}`;
}

/**
 * Cleans and normalizes single-line or multi-line cheat codes
 * (GameShark, Action Replay, CodeBreaker, GameGenie for GBA/GBC/GB).
 */
export function normalizeCheatCode(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) =>
      line
        .trim()
        .replace(/^\+\s*/, '') // Strip optional '+' continuation prefix from external files
        .replace(/[ \t]+/g, ' ')
        .toUpperCase()
    )
    .filter((line) => line.length > 0)
    .join('\n');
}

/**
 * Sanitizes a cheat title so it cannot break mGBA's `#` / `#!` header syntax.
 */
export function sanitizeCheatName(raw: string): string {
  return raw
    .replace(/[\r\n]+/g, ' ')
    .replace(/^[#!]+/, '')
    .trim();
}

/**
 * Counts the number of code lines in a cheat entry.
 */
export function countCheatLines(code: string): number {
  const normalized = normalizeCheatCode(code);
  if (!normalized) return 0;
  return normalized.split('\n').length;
}

/**
 * Validates cheat name and code before saving.
 */
export function validateCheatInput(name: string, code: string): CheatValidationResult {
  const normalizedName = sanitizeCheatName(name);
  const normalizedCode = normalizeCheatCode(code);

  if (!normalizedName) {
    return {
      valid: false,
      error: 'Escribe un nombre o descripción para el truco.',
      normalizedName,
      normalizedCode,
    };
  }

  if (!normalizedCode) {
    return {
      valid: false,
      error: 'Pega al menos una línea de código válida.',
      normalizedName,
      normalizedCode,
    };
  }

  const lines = normalizedCode.split('\n');
  const validLinePattern = /^[0-9A-F][0-9A-F :\-+]*[0-9A-F]$/;
  const invalidLine = lines.find((line) => line.length < 4 || !validLinePattern.test(line));

  if (invalidLine) {
    return {
      valid: false,
      error: `Línea con formato no válido: "${invalidLine}". Usa códigos hexadecimales (ej. 82025840 0044 o XXX-XXX-XXX).`,
      normalizedName,
      normalizedCode,
    };
  }

  return {
    valid: true,
    normalizedName,
    normalizedCode,
  };
}

/**
 * Serializes cheat entries into the exact `.cheats` plain-text format parsed by
 * mGBA's `mCheatParseFile`:
 * - Enabled cheat header:  `# Cheat Name`
 * - Disabled cheat header: `#! Cheat Name`
 * - Code lines directly below, one line per code.
 */
export function serializeCheatsFile(cheats: CheatEntry[]): string {
  const blocks: string[] = [];

  for (const cheat of cheats) {
    const normalizedCode = normalizeCheatCode(cheat.code);
    if (!normalizedCode) continue;

    const safeName = sanitizeCheatName(cheat.name) || 'Truco sin nombre';
    const headerPrefix = cheat.enabled ? '#' : '#!';
    blocks.push(`${headerPrefix} ${safeName}\n${normalizedCode}`);
  }

  if (blocks.length === 0) return '';
  return `${blocks.join('\n\n')}\n`;
}

/**
 * Parses an mGBA `.cheats` text file into structured `CheatEntry` items.
 * Handles `#` (enabled), `#!` (disabled), `!enabled` / `!disabled` directives,
 * optional `+` continuation lines, and raw multi-line code files.
 */
export function parseCheatsFile(content: string): CheatEntry[] {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const parsed: CheatEntry[] = [];
  const now = Date.now();

  let currentName: string | null = null;
  let currentEnabled = true;
  let currentCodes: string[] = [];

  const flushCurrent = () => {
    const normalizedCode = normalizeCheatCode(currentCodes.join('\n'));
    if (normalizedCode) {
      parsed.push({
        id: generateCheatId(),
        name: sanitizeCheatName(currentName || '') || `Truco importado ${parsed.length + 1}`,
        code: normalizedCode,
        enabled: currentEnabled,
        createdAt: now,
        updatedAt: now,
      });
    }
    currentName = null;
    currentEnabled = true;
    currentCodes = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('#!')) {
      flushCurrent();
      currentEnabled = false;
      currentName = line.slice(2).trim() || `Truco importado ${parsed.length + 1}`;
      continue;
    }

    if (line.startsWith('#')) {
      flushCurrent();
      currentEnabled = true;
      currentName = line.slice(1).trim() || `Truco importado ${parsed.length + 1}`;
      continue;
    }

    if (line.startsWith('!')) {
      const directive = line.slice(1).trim().toLowerCase();
      if (directive === 'disabled') {
        currentEnabled = false;
      } else if (directive === 'enabled') {
        currentEnabled = true;
      }
      continue;
    }

    if (currentName === null) {
      currentName = `Truco importado ${parsed.length + 1}`;
      currentEnabled = true;
    }
    currentCodes.push(line);
  }

  flushCurrent();
  return parsed;
}

/**
 * Loads persisted cheats for a ROM from localStorage.
 * Returns `null` if no entry has ever been stored for this ROM.
 */
export function loadStoredCheats(romId: string): CheatEntry[] | null {
  try {
    const raw = localStorage.getItem(getCheatsStorageKey(romId));
    if (raw === null) return null;
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .filter((item) => item && typeof item.code === 'string')
      .map((item) => ({
        id: typeof item.id === 'string' ? item.id : generateCheatId(),
        name: sanitizeCheatName(String(item.name || '')) || 'Truco sin nombre',
        code: normalizeCheatCode(item.code),
        enabled: Boolean(item.enabled),
        createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
        updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
      }))
      .filter((item) => item.code.length > 0);
  } catch (err) {
    console.warn('Error leyendo cheats desde localStorage:', err);
    return null;
  }
}

/**
 * Saves cheats for a specific ROM into localStorage.
 */
export function saveStoredCheats(romId: string, cheats: CheatEntry[]): void {
  try {
    localStorage.setItem(getCheatsStorageKey(romId), JSON.stringify(cheats));
  } catch (err) {
    console.warn('Error guardando cheats en localStorage:', err);
  }
}

/**
 * Loads cheats for the given ROM from localStorage, falling back to any existing
 * `.cheats` file already persisted in the mGBA virtual filesystem (IDBFS).
 */
export function loadCheatsForRom(emulator: mGBAEmulator | null, romId: string): CheatEntry[] {
  const stored = loadStoredCheats(romId);
  if (stored !== null) return stored;

  if (emulator) {
    try {
      const filePath = getCheatsFilePath(emulator, romId);
      if (emulator.FS.analyzePath(filePath).exists) {
        const rawBytes = emulator.FS.readFile(filePath);
        const text = new TextDecoder('utf-8').decode(rawBytes);
        const parsed = parseCheatsFile(text);
        saveStoredCheats(romId, parsed);
        return parsed;
      }
    } catch (err) {
      console.warn('No se pudo leer archivo .cheats previo del VFS:', err);
    }
  }

  return [];
}

/**
 * Writes the dynamically generated `.cheats` file into `/data/cheats/<romBaseName>.cheats`,
 * hot-reloads cheats inside the running mGBA core via `emulator.autoLoadCheats()`,
 * and syncs changes to IndexedDB (`IDBFS`) via `emulator.FSSync()`.
 */
export async function syncCheatsToCore(
  emulator: mGBAEmulator,
  romId: string,
  cheats: CheatEntry[]
): Promise<CheatSyncResult> {
  const paths = emulator.filePaths();
  const filePath = getCheatsFilePath(emulator, romId);
  const activeCount = cheats.filter((c) => c.enabled).length;

  try {
    if (!emulator.FS.analyzePath(paths.cheatsPath).exists) {
      emulator.FS.mkdir(paths.cheatsPath);
    }

    const serialized = serializeCheatsFile(cheats);
    const bytes = new TextEncoder().encode(serialized);

    // Always write the file (even if empty or all disabled with `#!`) so
    // `autoLoadCheats()` clears any previously active cheats from core memory.
    emulator.FS.writeFile(filePath, bytes);

    const loaded = emulator.autoLoadCheats();

    // Persist the VFS `.cheats` file to IndexedDB without blocking if IDBFS warns.
    try {
      await emulator.FSSync();
    } catch (syncErr) {
      console.warn('Aviso al sincronizar .cheats con IDBFS:', syncErr);
    }

    return {
      ok: Boolean(loaded) || cheats.length === 0,
      filePath,
      activeCount,
      totalCount: cheats.length,
    };
  } catch (err) {
    console.error('Error sincronizando cheats con mGBA:', err);
    return {
      ok: false,
      filePath,
      activeCount,
      totalCount: cheats.length,
      error: String(err),
    };
  }
}

/**
 * Downloads the current ROM's cheat list as a standard mGBA `.cheats` file.
 */
export function exportCheatsAsFile(romId: string, cheats: CheatEntry[]): void {
  const content = serializeCheatsFile(cheats);
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${getRomBaseName(romId)}.cheats`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
