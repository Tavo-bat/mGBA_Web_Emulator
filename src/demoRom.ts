/**
 * Generador de ROM Homebrew interactiva en binario puro de Game Boy (DMG/CGB).
 * Incluye soporte nativo de batería SRAM (MBC1+RAM+BATTERY) en 0xA000 para probar
 * guardado nativo (.sav), exportación/importación, scroll de fondo a 60 FPS,
 * sprites móviles (D-pad) y efectos de sonido en Canal 1 (Botón A y B).
 */

export function generateHomebrewDemoRom(): Uint8Array {
  const rom = new Uint8Array(32768); // Cartucho estándar de 32 KB

  // 1. Nintendo Logo (48 bytes requeridos por el Bootrom para validar el cartucho)
  const logo = [
    0xce, 0xed, 0x66, 0x66, 0xcc, 0x0d, 0x00, 0x0b, 0x03, 0x73, 0x00, 0x83, 0x00, 0x0c, 0x00, 0x0d,
    0x00, 0x08, 0x11, 0x1f, 0x88, 0x89, 0x00, 0x0e, 0xdc, 0xcc, 0x6e, 0xe6, 0xdd, 0xdd, 0xd9, 0x99,
    0xbb, 0xbb, 0x67, 0x63, 0x6e, 0x0e, 0xec, 0xcc, 0xdd, 0xdc, 0x99, 0x9f, 0xbb, 0xb9, 0x33, 0x3e
  ];
  logo.forEach((b, i) => {
    rom[0x104 + i] = b;
  });

  // 2. Cabecera (Header) con soporte SRAM + Batería (.sav)
  const title = "MGBA HOMEBREW";
  for (let i = 0; i < 15; i++) {
    rom[0x134 + i] = i < title.length ? title.charCodeAt(i) : 0;
  }
  rom[0x143] = 0x80; // CGB Flag (retrocompatible)
  rom[0x147] = 0x03; // MBC1 + RAM + BATTERY (permite exportar/importar .sav real)
  rom[0x148] = 0x00; // 32 KB ROM
  rom[0x149] = 0x02; // 8 KB SRAM (1 banco)
  rom[0x14a] = 0x01; // Non-Japanese
  rom[0x14b] = 0x33; // New Licensee
  rom[0x14c] = 0x00; // Version 1.0

  // Checksum obligatorio del header (0x134 - 0x14C)
  let chk = 0;
  for (let i = 0x134; i <= 0x14c; i++) {
    chk = (chk - rom[i] - 1) & 0xff;
  }
  rom[0x14d] = chk;

  // 3. Punto de entrada en 0x100 -> nop; jp 0x0150
  rom[0x100] = 0x00; // nop
  rom[0x101] = 0xc3; // jp
  rom[0x102] = 0x50; // 0x150 low
  rom[0x103] = 0x01; // 0x150 high

  // 4. Ensamblador interno Z80 (LR35902) desde 0x150
  const code: number[] = [];
  const labels: Record<string, number> = {};
  const fixups: Array<{ offset: number; target: string; type: 'rel' | 'abs' }> = [];

  const db = (...bytes: number[]) => bytes.forEach(b => code.push(b & 0xff));
  const dw = (word: number) => {
    code.push(word & 0xff);
    code.push((word >> 8) & 0xff);
  };
  const label = (name: string) => {
    labels[name] = code.length;
  };
  const jr = (condOrTarget: string, target?: string) => {
    if (!target) {
      target = condOrTarget;
      db(0x18); // jr e
    } else {
      if (condOrTarget === 'nz') db(0x20);
      else if (condOrTarget === 'z') db(0x28);
      else if (condOrTarget === 'nc') db(0x30);
      else if (condOrTarget === 'c') db(0x38);
    }
    fixups.push({ offset: code.length, target: target!, type: 'rel' });
    db(0x00);
  };
  const jp = (target: string) => {
    db(0xc3);
    fixups.push({ offset: code.length, target, type: 'abs' });
    dw(0x0000);
  };

  // --- PROGRAMA PRINCIPAL EN 0x150 ---
  db(0xf3); // di
  db(0x31, 0xfe, 0xff); // ld sp, 0xFFFE

  // Habilitar SRAM externa de MBC1 escribiendo 0x0A en 0x0000
  db(0x3e, 0x0a); // ld a, 0x0A
  db(0xea, 0x00, 0x00); // ld (0x0000), a

  // Esperar VBlank antes de apagar el LCD
  label('wait_vb_init');
  db(0xf0, 0x44); // ld a, (0xFF44) - LY
  db(0xfe, 0x90); // cp 144
  jr('nz', 'wait_vb_init');

  // Apagar LCD
  db(0xaf); // xor a
  db(0xe0, 0x40); // ld (0xFF40), a

  // Configurar audio retro (NR52, NR50, NR51)
  db(0x3e, 0x80); // ld a, 0x80 (Master Sound ON)
  db(0xe0, 0x26); // ld (0xFF26), a
  db(0x3e, 0x77); // ld a, 0x77 (Volumen max)
  db(0xe0, 0x24); // ld (0xFF24), a
  db(0x3e, 0xff); // ld a, 0xFF (Canales estéreo)
  db(0xe0, 0x25); // ld (0xFF25), a

  // Configurar Paletas (BGP, OBP0, OBP1)
  db(0x3e, 0xe4); // ld a, 0xE4 (11 10 01 00)
  db(0xe0, 0x47); // ld (0xFF47), a
  db(0xe0, 0x48); // ld (0xFF48), a
  db(0x3e, 0xd2); // ld a, 0xD2
  db(0xe0, 0x49); // ld (0xFF49), a

  // Copiar Tiles a VRAM 0x8000
  db(0x21, 0x00, 0x80); // ld hl, 0x8000
  // Tile 0: Vacío (16 bytes 0)
  db(0x0e, 0x10); // ld c, 16
  label('clr_tile0');
  db(0x36, 0x00); // ld (hl), 0
  db(0x23); // inc hl
  db(0x0d); // dec c
  jr('nz', 'clr_tile0');

  // Tile 1: Bloque decorativo (Rejilla espacial)
  const gridPattern = [
    0xff, 0x00, 0x81, 0x7e, 0xbd, 0x42, 0xa5, 0x5a,
    0xa5, 0x5a, 0xbd, 0x42, 0x81, 0x7e, 0xff, 0x00
  ];
  gridPattern.forEach(b => {
    db(0x36, b);
    db(0x23);
  });

  // Tile 2: Nave espacial principal (8x8 píxeles)
  const shipPattern = [
    0x18, 0x18, // ..XX....
    0x3c, 0x24, // .XXXX...
    0x7e, 0x5a, // XXXXXX..
    0xdb, 0xff, // XX.XX.XX
    0xff, 0xff, // XXXXXXXX
    0x7e, 0x7e, // .XXXXXX.
    0xa5, 0x81, // X.X..X.X
    0x42, 0x00  // .X....X.
  ];
  shipPattern.forEach(b => {
    db(0x36, b);
    db(0x23);
  });

  // Tile 3: Estrella brillante de fondo
  const starPattern = [
    0x00, 0x00,
    0x10, 0x00,
    0x38, 0x10,
    0x10, 0x00,
    0x00, 0x00,
    0x00, 0x00,
    0x00, 0x02,
    0x00, 0x00
  ];
  starPattern.forEach(b => {
    db(0x36, b);
    db(0x23);
  });

  // Poblar mapa de fondo en 0x9800 (32x32 tiles = 1024 bytes) con campo estelar
  db(0x21, 0x00, 0x98); // ld hl, 0x9800
  db(0x11, 0x00, 0x04); // ld de, 1024
  label('clr_map');
  db(0x7b); // ld a, e
  db(0xac); // xor h
  db(0xe6, 0x07); // and 0x07
  db(0xfe, 0x03); // cp 3
  db(0x3e, 0x00); // ld a, 0
  jr('nz', 'write_bg_tile');
  db(0x3e, 0x03); // ld a, 3 (estrella)
  label('write_bg_tile');
  db(0x22); // ld (hl+), a
  db(0x1b); // dec de
  db(0x7a); // ld a, d
  db(0xb3); // or e
  jr('nz', 'clr_map');

  // Limpiar OAM (0xFE00 - 0xFE9F)
  db(0x21, 0x00, 0xfe); // ld hl, 0xFE00
  db(0x0e, 0xa0); // ld c, 160
  label('clr_oam');
  db(0x36, 0x00);
  db(0x23);
  db(0x0d);
  jr('nz', 'clr_oam');

  // Comprobar si existe partida guardada en SRAM (0xA000 == 0x42)
  db(0xfa, 0x00, 0xa0); // ld a, (0xA000)
  db(0xfe, 0x42);       // cp 0x42 (firma mágica)
  jr('nz', 'init_default_pos');

  // Cargar X e Y desde SRAM (0xA001 = Y, 0xA002 = X)
  db(0xfa, 0x01, 0xa0); // ld a, (0xA001)
  db(0xe0, 0x80);       // ld (0xFF80), a
  db(0xfa, 0x02, 0xa0); // ld a, (0xA002)
  db(0xe0, 0x81);       // ld (0xFF81), a
  jr('setup_sprite');

  label('init_default_pos');
  db(0x3e, 0x50); // ld a, 80 (posición inicial centro)
  db(0xe0, 0x80); // ld (0xFF80), a (Y)
  db(0xe0, 0x81); // ld (0xFF81), a (X)
  // Guardar estado inicial en SRAM para que .sav exista desde el arranque
  db(0x3e, 0x42);
  db(0xea, 0x00, 0xa0); // ld (0xA000), a
  db(0x3e, 0x50);
  db(0xea, 0x01, 0xa0); // ld (0xA001), a
  db(0xea, 0x02, 0xa0); // ld (0xA002), a

  label('setup_sprite');
  // Inicializar Sprite 0 en OAM 0xFE00
  db(0x21, 0x00, 0xfe); // ld hl, 0xFE00
  db(0xf0, 0x80); // ld a, (0xFF80)
  db(0x22);       // ld (hl+), a (Y)
  db(0xf0, 0x81); // ld a, (0xFF81)
  db(0x22);       // ld (hl+), a (X)
  db(0x36, 0x02); // ld (hl), 2 (Tile nave)
  db(0x23);
  db(0x36, 0x00); // ld (hl), 0 (Flags)

  // Variables de scroll en HRAM (0xFF82 = SCY, 0xFF83 = cooldown audio)
  db(0xaf);
  db(0xe0, 0x82);
  db(0xe0, 0x83);

  // Encender LCD con Sprites y Fondo activados (0x93)
  db(0x3e, 0x93);
  db(0xe0, 0x40);

  // --- BUCLE PRINCIPAL DE JUEGO (60 FPS) ---
  label('main_loop');

  // Esperar inicio de VBlank (LY == 144)
  label('wait_vb_loop');
  db(0xf0, 0x44); // ld a, (0xFF44)
  db(0xfe, 0x90); // cp 144
  jr('nz', 'wait_vb_loop');

  // Animar el scroll espacial vertical (SCY en 0xFF42)
  db(0xf0, 0x82); // ld a, (0xFF82)
  db(0x3d);       // dec a (mover estrellas hacia abajo)
  db(0xe0, 0x82); // ld (0xFF82), a
  db(0xe0, 0x42); // ld (0xFF42), a (SCY)

  // Reducir cooldown de sonido si es > 0
  db(0xf0, 0x83);
  db(0xb7); // or a
  jr('z', 'read_joypad');
  db(0x3d); // dec a
  db(0xe0, 0x83);

  label('read_joypad');
  // Leer D-pad (0xFF00 <- 0x20)
  db(0x3e, 0x20);
  db(0xe0, 0x00);
  db(0xf0, 0x00);
  db(0xf0, 0x00);
  db(0x47); // ld b, a (estado D-pad en B)

  // Leer Botones A, B, Select, Start (0xFF00 <- 0x10)
  db(0x3e, 0x10);
  db(0xe0, 0x00);
  db(0xf0, 0x00);
  db(0xf0, 0x00);
  db(0x4f); // ld c, a (estado botones en C)

  // Resetear líneas de joypad
  db(0x3e, 0x30);
  db(0xe0, 0x00);

  // --- Movimiento D-Pad ---
  // Down (Bit 3)
  db(0x78);
  db(0xe6, 0x08);
  jr('nz', 'check_up');
  db(0xf0, 0x80);
  db(0xfe, 0x90); // Límite inferior (144)
  jr('z', 'check_up');
  db(0x3c);
  db(0x3c); // Velocidad 2px/frame
  db(0xe0, 0x80);

  label('check_up');
  // Up (Bit 2)
  db(0x78);
  db(0xe6, 0x04);
  jr('nz', 'check_left');
  db(0xf0, 0x80);
  db(0xfe, 0x14); // Límite superior (20)
  jr('z', 'check_left');
  db(0x3d);
  db(0x3d);
  db(0xe0, 0x80);

  label('check_left');
  // Left (Bit 1)
  db(0x78);
  db(0xe6, 0x02);
  jr('nz', 'check_right');
  db(0xf0, 0x81);
  db(0xfe, 0x0c); // Límite izquierdo (12)
  jr('z', 'check_right');
  db(0x3d);
  db(0x3d);
  db(0xe0, 0x81);

  label('check_right');
  // Right (Bit 0)
  db(0x78);
  db(0xe6, 0x01);
  jr('nz', 'check_btn_a');
  db(0xf0, 0x81);
  db(0xfe, 0x9c); // Límite derecho (156)
  jr('z', 'check_btn_a');
  db(0x3c);
  db(0x3c);
  db(0xe0, 0x81);

  // --- Botón A (Bit 0 de C): Disparo Láser + Guardar posición en SRAM ---
  label('check_btn_a');
  db(0x79);
  db(0xe6, 0x01);
  jr('nz', 'check_btn_b');

  // Si cooldown == 0, disparar sonido láser con barrido (Sweep) en Canal 1
  db(0xf0, 0x83);
  db(0xb7);
  jr('nz', 'check_btn_b');
  db(0x3e, 0x1a); // NR10: Sweep time 1, decrease, shift 2
  db(0xe0, 0x10);
  db(0x3e, 0x80); // NR11: Duty 50%
  db(0xe0, 0x11);
  db(0x3e, 0xf2); // NR12: Volumen 15, decay 2
  db(0xe0, 0x12);
  db(0x3e, 0x90); // NR13: Freq low
  db(0xe0, 0x13);
  db(0x3e, 0xc7); // NR14: Trigger + Freq high
  db(0xe0, 0x14);
  db(0x3e, 0x0c); // Cooldown de 12 frames
  db(0xe0, 0x83);

  // --- Botón B (Bit 1 de C): Hipervelocidad + Paleta Invertida ---
  label('check_btn_b');
  db(0x79);
  db(0xe6, 0x02);
  jr('nz', 'restore_palette');
  // B presionado: Invertir paleta y acelerar estrellas
  db(0x3e, 0x1b); // Paleta invertida
  db(0xe0, 0x47);
  db(0xf0, 0x82);
  db(0xd6, 0x03); // sub 3 (scroll 4x más rápido)
  db(0xe0, 0x82);
  db(0xe0, 0x42);
  jr('update_oam');

  label('restore_palette');
  // B suelto: Asegurar paleta estándar 0xE4
  db(0x3e, 0xe4);
  db(0xe0, 0x47);

  label('update_oam');
  // Actualizar OAM y persistir coordenadas actuales en SRAM (0xA001, 0xA002)
  db(0xf0, 0x80);
  db(0xea, 0x00, 0xfe); // OAM Y
  db(0xea, 0x01, 0xa0); // SRAM Y
  db(0xf0, 0x81);
  db(0xea, 0x01, 0xfe); // OAM X
  db(0xea, 0x02, 0xa0); // SRAM X

  // Esperar a que termine la línea 145 para un solo tick por VBlank
  label('wait_line');
  db(0xf0, 0x44);
  db(0xfe, 0x91); // cp 145
  jr('nz', 'wait_line');

  jp('main_loop');

  // Resolver saltos relativos y absolutos
  for (const f of fixups) {
    const targetAddr = labels[f.target];
    if (targetAddr === undefined) {
      throw new Error(`Etiqueta desconocida en demo assembler: ${f.target}`);
    }
    if (f.type === 'rel') {
      const rel = targetAddr - (f.offset + 1);
      code[f.offset] = rel & 0xff;
    } else {
      const absAddr = 0x0150 + targetAddr;
      code[f.offset] = absAddr & 0xff;
      code[f.offset + 1] = (absAddr >> 8) & 0xff;
    }
  }

  // Escribir programa en la ROM a partir de 0x150
  code.forEach((byte, index) => {
    rom[0x150 + index] = byte;
  });

  // Calcular Global Checksum (0x14E-0x14F)
  let gChk = 0;
  for (let i = 0; i < 32768; i++) {
    if (i !== 0x14e && i !== 0x14f) {
      gChk = (gChk + rom[i]) & 0xffff;
    }
  }
  rom[0x14e] = (gChk >> 8) & 0xff;
  rom[0x14f] = gChk & 0xff;

  return rom;
}
