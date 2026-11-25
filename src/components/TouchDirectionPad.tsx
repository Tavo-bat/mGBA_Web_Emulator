import React, { useRef, useState, useEffect, useCallback } from 'react';

export type DirectionKey = 'Up' | 'Down' | 'Left' | 'Right';
export type DirectionPadMode = 'joystick' | 'dpad';

interface TouchDirectionPadProps {
  mode: DirectionPadMode;
  onPress: (direction: DirectionKey) => void;
  onUnpress: (direction: DirectionKey) => void;
  sizeClassName?: string;
}

type DirectionState = Record<DirectionKey, boolean>;

const EMPTY_DIRS: DirectionState = {
  Up: false,
  Down: false,
  Left: false,
  Right: false,
};

const ALL_DIRS: DirectionKey[] = ['Up', 'Down', 'Left', 'Right'];

/**
 * Convierte un vector (dx, dy) respecto al centro en direcciones digitales GBA/GB
 * usando sectores angulares (55° cardinales, 35° diagonales) con zona muerta central.
 */
function computeDirectionsFromVector(dx: number, dy: number, deadzone: number): DirectionState {
  const distance = Math.hypot(dx, dy);
  if (distance < deadzone) {
    return { ...EMPTY_DIRS };
  }

  // Ángulo en grados [0, 360): 0° = Derecha, 90° = Abajo, 180° = Izquierda, 270° = Arriba
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle < 0) angle += 360;

  if (angle >= 332.5 || angle < 27.5) {
    return { Up: false, Down: false, Left: false, Right: true };
  }
  if (angle >= 27.5 && angle < 62.5) {
    return { Up: false, Down: true, Left: false, Right: true };
  }
  if (angle >= 62.5 && angle < 117.5) {
    return { Up: false, Down: true, Left: false, Right: false };
  }
  if (angle >= 117.5 && angle < 152.5) {
    return { Up: false, Down: true, Left: true, Right: false };
  }
  if (angle >= 152.5 && angle < 207.5) {
    return { Up: false, Down: false, Left: true, Right: false };
  }
  if (angle >= 207.5 && angle < 242.5) {
    return { Up: true, Down: false, Left: true, Right: false };
  }
  if (angle >= 242.5 && angle < 297.5) {
    return { Up: true, Down: false, Left: false, Right: false };
  }
  return { Up: true, Down: false, Left: false, Right: true };
}

export const TouchDirectionPad: React.FC<TouchDirectionPadProps> = ({
  mode,
  onPress,
  onUnpress,
  sizeClassName = 'w-[132px] h-[132px] xs:w-[140px] xs:h-[140px] sm:w-[148px] sm:h-[148px]',
}) => {
  const padRef = useRef<HTMLDivElement>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const pressedDirsRef = useRef<DirectionState>({ ...EMPTY_DIRS });
  const callbacksRef = useRef({ onPress, onUnpress });

  callbacksRef.current = { onPress, onUnpress };

  const [isActive, setIsActive] = useState(false);
  const [knobOffset, setKnobOffset] = useState({ x: 0, y: 0 });
  const [indicatorAngle, setIndicatorAngle] = useState<number | null>(null);
  const [activeDirs, setActiveDirs] = useState<DirectionState>({ ...EMPTY_DIRS });

  const syncDirectionState = useCallback((nextDirs: DirectionState) => {
    const prev = pressedDirsRef.current;
    let changed = false;

    for (const dir of ALL_DIRS) {
      if (nextDirs[dir] !== prev[dir]) {
        changed = true;
        if (nextDirs[dir]) {
          callbacksRef.current.onPress(dir);
        } else {
          callbacksRef.current.onUnpress(dir);
        }
      }
    }

    if (changed) {
      pressedDirsRef.current = { ...nextDirs };
      setActiveDirs({ ...nextDirs });
    }
  }, []);

  const releaseAll = useCallback(() => {
    activePointerIdRef.current = null;
    setIsActive(false);
    setKnobOffset({ x: 0, y: 0 });
    setIndicatorAngle(null);
    syncDirectionState(EMPTY_DIRS);
  }, [syncDirectionState]);

  // Liberar cualquier dirección activa al desmontar o cambiar modo (ej. al rotar pantalla)
  useEffect(() => {
    return () => {
      for (const dir of ALL_DIRS) {
        if (pressedDirsRef.current[dir]) {
          callbacksRef.current.onUnpress(dir);
          pressedDirsRef.current[dir] = false;
        }
      }
    };
  }, []);

  const updateFromClientPoint = useCallback(
    (clientX: number, clientY: number) => {
      const el = padRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const radius = Math.min(rect.width, rect.height) / 2;

      const rawDx = clientX - centerX;
      const rawDy = clientY - centerY;
      const distance = Math.hypot(rawDx, rawDy);

      // Limitar el recorrido visual de la palanca al borde interior del anillo
      const maxTravel = radius * 0.64;
      const clampedDist = Math.min(distance, maxTravel);
      const ratio = distance > 0 ? clampedDist / distance : 0;
      const clampedX = rawDx * ratio;
      const clampedY = rawDy * ratio;

      setKnobOffset({ x: clampedX, y: clampedY });

      const deadzone = radius * 0.2;
      if (distance >= deadzone) {
        // Ángulo para rotar el arco luminoso (0° apunta hacia arriba / norte)
        const angleFromTopDeg = (Math.atan2(rawDy, rawDx) * 180) / Math.PI + 90;
        setIndicatorAngle(angleFromTopDeg);
      } else {
        setIndicatorAngle(null);
      }

      const nextDirs = computeDirectionsFromVector(rawDx, rawDy, deadzone);
      syncDirectionState(nextDirs);
    },
    [syncDirectionState]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (activePointerIdRef.current !== null && activePointerIdRef.current !== e.pointerId) {
      return;
    }

    activePointerIdRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Algunos navegadores pueden rechazar setPointerCapture en eventos sintéticos
    }

    setIsActive(true);
    updateFromClientPoint(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    updateFromClientPoint(e.clientX, e.clientY);
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignorar si ya fue liberado
    }
    releaseAll();
  };

  // MODO JOYSTICK ESTILO GENSHIN IMPACT
  if (mode === 'joystick') {
    return (
      <div
        ref={padRef}
        role="application"
        aria-label="Joystick táctil direccional"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onLostPointerCapture={handlePointerEnd}
        onContextMenu={(e) => e.preventDefault()}
        className={`relative ${sizeClassName} shrink-0 rounded-full touch-none select-none cursor-grab active:cursor-grabbing flex items-center justify-center`}
      >
        {/* Anillo base translúcido */}
        <div
          className={`absolute inset-0 rounded-full border-2 transition-colors duration-150 ${
            isActive
              ? 'bg-gray-900/65 border-cyan-400/45 shadow-[0_0_24px_rgba(34,211,238,0.16)]'
              : 'bg-gray-950/60 border-gray-700/75 shadow-[inset_0_0_20px_rgba(0,0,0,0.65)]'
          }`}
        />

        {/* Anillo guía interior sutil */}
        <div className="absolute inset-4 rounded-full border border-white/[0.06] pointer-events-none" />

        {/* Indicadores cardinales discretos */}
        <span
          className={`absolute top-2 left-1/2 -translate-x-1/2 text-[8px] leading-none pointer-events-none transition-colors ${
            activeDirs.Up ? 'text-cyan-300' : 'text-gray-600'
          }`}
        >
          ▲
        </span>
        <span
          className={`absolute bottom-2 left-1/2 -translate-x-1/2 text-[8px] leading-none pointer-events-none transition-colors ${
            activeDirs.Down ? 'text-cyan-300' : 'text-gray-600'
          }`}
        >
          ▼
        </span>
        <span
          className={`absolute left-2 top-1/2 -translate-y-1/2 text-[8px] leading-none pointer-events-none transition-colors ${
            activeDirs.Left ? 'text-cyan-300' : 'text-gray-600'
          }`}
        >
          ◄
        </span>
        <span
          className={`absolute right-2 top-1/2 -translate-y-1/2 text-[8px] leading-none pointer-events-none transition-colors ${
            activeDirs.Right ? 'text-cyan-300' : 'text-gray-600'
          }`}
        >
          ►
        </span>

        {/* Arco direccional luminoso con flecha estilo Genshin Impact */}
        {indicatorAngle !== null && (
          <svg
            viewBox="0 0 120 120"
            className="absolute inset-0 w-full h-full pointer-events-none drop-shadow-[0_0_8px_rgba(56,189,248,0.85)]"
            style={{ transform: `rotate(${indicatorAngle}deg)` }}
          >
            {/* Arco superior brillante de ~70° */}
            <path
              d="M 27.5 16.5 A 55 55 0 0 1 92.5 16.5"
              fill="none"
              stroke="url(#joystickArcGrad)"
              strokeWidth="4"
              strokeLinecap="round"
            />
            {/* Punta triangular apuntando en la dirección del movimiento */}
            <polygon points="60,1 54.5,10 65.5,10" fill="#67e8f9" />
            <defs>
              <linearGradient id="joystickArcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#a855f7" stopOpacity="0.85" />
                <stop offset="50%" stopColor="#38bdf8" stopOpacity="1" />
                <stop offset="100%" stopColor="#a855f7" stopOpacity="0.85" />
              </linearGradient>
            </defs>
          </svg>
        )}

        {/* Palanca / Thumb Knob flotante */}
        <div
          className={`relative w-12 h-12 sm:w-[52px] sm:h-[52px] rounded-full pointer-events-none flex items-center justify-center ${
            isActive
              ? 'bg-gradient-to-br from-cyan-400/35 via-purple-500/40 to-gray-900/80 border-2 border-cyan-300/80 shadow-[0_0_16px_rgba(56,189,248,0.45)]'
              : 'bg-gradient-to-br from-gray-700/75 to-gray-900/90 border-2 border-gray-500/50 shadow-lg transition-transform duration-150 ease-out'
          }`}
          style={{
            transform: `translate3d(${knobOffset.x}px, ${knobOffset.y}px, 0)`,
          }}
        >
          {/* Aro interior con 4 puntos estilo Genshin */}
          <div className="w-6 h-6 rounded-full border border-white/30 relative flex items-center justify-center">
            <span className="w-1.5 h-1.5 rounded-full bg-white/60" />
            <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-cyan-200/70" />
            <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-cyan-200/70" />
            <span className="absolute -left-0.5 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-cyan-200/70" />
            <span className="absolute -right-0.5 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-cyan-200/70" />
          </div>
        </div>
      </div>
    );
  }

  // MODO CRUCETA CLÁSICA (TAMBIÉN CON ARRASTRE CONTINUO SIN LEVANTAR EL DEDO)
  return (
    <div
      ref={padRef}
      role="application"
      aria-label="Cruceta direccional táctil deslizable"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onLostPointerCapture={handlePointerEnd}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative ${sizeClassName} shrink-0 bg-gray-950/85 rounded-full border-4 border-gray-800 shadow-xl touch-none select-none cursor-pointer`}
    >
      <div
        className={`absolute top-1.5 left-1/2 -translate-x-1/2 w-9 xs:w-10 h-11 xs:h-12 border border-gray-900 rounded-t-lg pointer-events-none flex items-start justify-center pt-1.5 text-[10px] transition-colors ${
          activeDirs.Up ? 'bg-purple-600 text-white shadow-[0_0_12px_rgba(147,51,234,0.6)]' : 'bg-gray-800 text-gray-400'
        }`}
      >
        ▲
      </div>
      <div
        className={`absolute bottom-1.5 left-1/2 -translate-x-1/2 w-9 xs:w-10 h-11 xs:h-12 border border-gray-900 rounded-b-lg pointer-events-none flex items-end justify-center pb-1.5 text-[10px] transition-colors ${
          activeDirs.Down ? 'bg-purple-600 text-white shadow-[0_0_12px_rgba(147,51,234,0.6)]' : 'bg-gray-800 text-gray-400'
        }`}
      >
        ▼
      </div>
      <div
        className={`absolute left-1.5 top-1/2 -translate-y-1/2 w-11 xs:w-12 h-9 xs:h-10 border border-gray-900 rounded-l-lg pointer-events-none flex items-center justify-start pl-1.5 text-[10px] transition-colors ${
          activeDirs.Left ? 'bg-purple-600 text-white shadow-[0_0_12px_rgba(147,51,234,0.6)]' : 'bg-gray-800 text-gray-400'
        }`}
      >
        ◄
      </div>
      <div
        className={`absolute right-1.5 top-1/2 -translate-y-1/2 w-11 xs:w-12 h-9 xs:h-10 border border-gray-900 rounded-r-lg pointer-events-none flex items-center justify-end pr-1.5 text-[10px] transition-colors ${
          activeDirs.Right ? 'bg-purple-600 text-white shadow-[0_0_12px_rgba(147,51,234,0.6)]' : 'bg-gray-800 text-gray-400'
        }`}
      >
        ►
      </div>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 bg-gray-900 rounded-full pointer-events-none shadow-inner border border-gray-800/80" />
    </div>
  );
};
