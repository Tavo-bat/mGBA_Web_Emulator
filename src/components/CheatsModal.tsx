import React, { useState, useRef, useEffect } from 'react';
import {
  Wand2,
  Plus,
  Pencil,
  Trash2,
  Upload,
  Download,
  X,
  AlertCircle,
  Check,
  FolderOpen,
  Code2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  type CheatEntry,
  countCheatLines,
  validateCheatInput,
} from '../utils/cheats';

interface CheatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  romLoaded: boolean;
  romName: string;
  cheats: CheatEntry[];
  onAddCheat: (name: string, code: string) => Promise<void>;
  onUpdateCheat: (id: string, name: string, code: string) => Promise<void>;
  onToggleCheat: (id: string) => Promise<void>;
  onDeleteCheat: (id: string) => Promise<void>;
  onImportCheatsFile: (file: File) => Promise<void>;
  onExportCheatsFile: () => void;
  onRequestLoadRom: () => void;
}

export const CheatsModal: React.FC<CheatsModalProps> = ({
  isOpen,
  onClose,
  romLoaded,
  romName,
  cheats,
  onAddCheat,
  onUpdateCheat,
  onToggleCheat,
  onDeleteCheat,
  onImportCheatsFile,
  onExportCheatsFile,
  onRequestLoadRom,
}) => {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const importInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Cerrar con Escape y limpiar estado de edición al cerrar/cambiar ROM
  useEffect(() => {
    if (!isOpen) {
      setEditingId(null);
      setName('');
      setCode('');
      setFormError(null);
      return;
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const activeCount = cheats.filter((c) => c.enabled).length;

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setCode('');
    setFormError(null);
  };

  const handleStartEdit = (cheat: CheatEntry) => {
    setEditingId(cheat.id);
    setName(cheat.name);
    setCode(cheat.code);
    setFormError(null);
    setTimeout(() => nameInputRef.current?.focus(), 30);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!romLoaded || isSubmitting) return;

    const validation = validateCheatInput(name, code);
    if (!validation.valid) {
      setFormError(validation.error || 'Revisa el nombre y el código ingresado.');
      return;
    }

    try {
      setIsSubmitting(true);
      setFormError(null);
      if (editingId) {
        await onUpdateCheat(editingId, validation.normalizedName, validation.normalizedCode);
      } else {
        await onAddCheat(validation.normalizedName, validation.normalizedCode);
      }
      resetForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImportChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await onImportCheatsFile(file);
    e.target.value = '';
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Evita que eventos de teclado dentro del modal burbujeen a listeners externos
  const stopKeyPropagation = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape') {
      e.stopPropagation();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-2.5 sm:p-4 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={stopKeyPropagation}
      onKeyUp={stopKeyPropagation}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cheats-modal-title"
        className="bg-[#14171f] border border-gray-800 rounded-2xl max-w-2xl w-full max-h-[92vh] shadow-2xl shadow-purple-950/30 flex flex-col overflow-hidden"
      >
        {/* HEADER */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-gray-800/80 bg-[#161920]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-purple-600/30 to-pink-600/30 border border-purple-500/40 shrink-0">
              <Wand2 className="w-4 h-4 sm:w-5 sm:h-5 text-purple-300" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 id="cheats-modal-title" className="text-sm sm:text-base font-bold text-white">
                  Gestor de Cheats
                </h3>
                {romLoaded ? (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-purple-950/60 border border-purple-500/30 text-purple-300">
                    {activeCount} {activeCount === 1 ? 'activo' : 'activos'} / {cheats.length}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-amber-950/50 border border-amber-500/35 text-amber-300">
                    Sin ROM cargada
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-400 font-mono truncate">
                {romLoaded ? `Juego actual: ${romName}` : 'Carga un juego (.gba, .gbc o .gb) para aplicar trucos'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors cursor-pointer shrink-0"
            aria-label="Cerrar gestor de cheats"
          >
            <X size={18} />
          </button>
        </div>

        {/* CONTENIDO SCROLLEABLE */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col gap-5">
          {/* AVISO CUANDO NO HAY ROM CARGADA */}
          {!romLoaded && (
            <div className="rounded-xl bg-amber-950/25 border border-amber-500/40 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-amber-200">
                    No hay ninguna ROM cargada todavía
                  </h4>
                  <p className="text-[11px] sm:text-xs text-amber-200/75 leading-relaxed mt-0.5">
                    Los trucos se vinculan automáticamente al juego en ejecución y se aplican en caliente sobre el núcleo mGBA. Carga una ROM primero para añadir, activar o importar trucos.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onRequestLoadRom();
                }}
                className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors shadow"
              >
                <FolderOpen size={14} />
                Cargar ROM
              </button>
            </div>
          )}

          {/* FORMULARIO PARA AÑADIR / EDITAR TRUCO */}
          <form
            onSubmit={handleSubmit}
            className={`rounded-xl bg-[#10131a] border p-4 flex flex-col gap-3 transition-colors ${
              editingId
                ? 'border-amber-500/50 shadow-lg shadow-amber-950/20'
                : 'border-gray-800/90'
            } ${!romLoaded ? 'opacity-50 pointer-events-none select-none' : ''}`}
          >
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
                {editingId ? (
                  <>
                    <Pencil size={13} className="text-amber-400" />
                    <span className="text-amber-300">Editando truco</span>
                  </>
                ) : (
                  <>
                    <Plus size={14} className="text-purple-400" />
                    <span>Añadir nuevo truco</span>
                  </>
                )}
              </h4>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-[11px] font-mono text-gray-400 hover:text-white cursor-pointer underline underline-offset-2"
                >
                  Cancelar edición
                </button>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="cheat-name-input" className="text-[11px] font-mono text-gray-400">
                Nombre / Descripción
              </label>
              <input
                ref={nameInputRef}
                id="cheat-name-input"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (formError) setFormError(null);
                }}
                disabled={!romLoaded}
                placeholder="Ej. Master Code, Caramelos Raros infinitos, Dinero máximo..."
                autoComplete="off"
                spellCheck={false}
                className="w-full px-3 py-2 rounded-xl bg-[#161920] border border-gray-700/80 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/25 text-xs sm:text-sm text-white placeholder-gray-500 outline-none transition-all select-text"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="cheat-code-input" className="text-[11px] font-mono text-gray-400">
                  Código del truco (una o varias líneas)
                </label>
                {code.trim() && (
                  <span className="text-[10px] font-mono text-purple-400">
                    {countCheatLines(code)} {countCheatLines(code) === 1 ? 'línea' : 'líneas'}
                  </span>
                )}
              </div>
              <textarea
                id="cheat-code-input"
                rows={4}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  if (formError) setFormError(null);
                }}
                disabled={!romLoaded}
                placeholder={'D8BAE4D9 4864DCE5\nA86CDBA5 19BA49B3'}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="characters"
                spellCheck={false}
                className="w-full px-3 py-2 rounded-xl bg-[#161920] border border-gray-700/80 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/25 text-xs font-mono text-emerald-300 placeholder-gray-600 outline-none transition-all resize-y min-h-[84px] select-text"
              />
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Soporta formatos <strong className="text-gray-300">GameShark</strong>,{' '}
                <strong className="text-gray-300">Action Replay</strong>,{' '}
                <strong className="text-gray-300">CodeBreaker</strong> y{' '}
                <strong className="text-gray-300">GameGenie</strong> (GBA / GBC / GB), incluyendo Master Codes y códigos compuestos de múltiples líneas. Los espacios extra se limpian automáticamente.
              </p>
            </div>

            {formError && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-red-950/40 border border-red-500/40 text-red-300 text-xs">
                <AlertCircle size={14} className="shrink-0 mt-0.5 text-red-400" />
                <span>{formError}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-3.5 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold cursor-pointer transition-colors"
                >
                  Cancelar
                </button>
              )}
              <button
                type="submit"
                disabled={!romLoaded || isSubmitting}
                className={`px-4 py-2 rounded-xl text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                  editingId
                    ? 'bg-amber-600 hover:bg-amber-500'
                    : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500'
                }`}
              >
                {editingId ? <Check size={14} /> : <Plus size={14} />}
                <span>{editingId ? 'Guardar cambios' : 'Añadir y aplicar truco'}</span>
              </button>
            </div>
          </form>

          {/* BARRA DE LISTA + IMPORTAR / EXPORTAR .cheats */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-2 border-b border-gray-800/80 pb-2.5">
              <div className="flex items-center gap-2">
                <Code2 size={15} className="text-purple-400" />
                <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-gray-300">
                  Trucos del juego ({cheats.length})
                </h4>
              </div>

              <div className="flex items-center gap-2">
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".cheats,.txt"
                  onChange={handleImportChange}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={!romLoaded}
                  onClick={() => importInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg bg-gray-900 hover:bg-gray-800 border border-gray-700/80 text-gray-200 hover:text-white text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Importar archivo .cheats local"
                >
                  <Upload size={12} className="text-purple-400" />
                  <span>Importar .cheats</span>
                </button>
                <button
                  type="button"
                  disabled={!romLoaded || cheats.length === 0}
                  onClick={onExportCheatsFile}
                  className="px-3 py-1.5 rounded-lg bg-gray-900 hover:bg-gray-800 border border-gray-700/80 text-gray-200 hover:text-white text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Exportar lista actual a un archivo .cheats"
                >
                  <Download size={12} className="text-emerald-400" />
                  <span>Exportar .cheats</span>
                </button>
              </div>
            </div>

            {/* LISTA DE TRUCOS */}
            {!romLoaded ? (
              <div className="rounded-xl border border-dashed border-gray-800 bg-gray-900/20 p-6 text-center">
                <p className="text-xs text-gray-500 font-mono">
                  Esperando que cargues una ROM para mostrar sus trucos guardados.
                </p>
              </div>
            ) : cheats.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-800 bg-gray-900/20 p-6 text-center flex flex-col items-center gap-1.5">
                <Wand2 className="w-6 h-6 text-gray-600 mb-1" />
                <p className="text-xs font-semibold text-gray-300">
                  Aún no hay trucos guardados para este juego
                </p>
                <p className="text-[11px] text-gray-500 max-w-sm">
                  Añade tu primer código en el formulario superior o importa un archivo <span className="font-mono text-gray-400">.cheats</span> compatible con mGBA.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {cheats.map((cheat) => {
                  const lines = cheat.code.split('\n');
                  const isMultiline = lines.length > 2;
                  const isExpanded = Boolean(expandedIds[cheat.id]);
                  const previewLines = isExpanded ? lines : lines.slice(0, 2);
                  const isBeingEdited = editingId === cheat.id;

                  return (
                    <div
                      key={cheat.id}
                      className={`rounded-xl border p-3 sm:p-3.5 transition-all flex flex-col gap-2 ${
                        isBeingEdited
                          ? 'bg-amber-950/15 border-amber-500/50'
                          : cheat.enabled
                            ? 'bg-[#161a24] border-purple-500/35 shadow-sm shadow-purple-950/20'
                            : 'bg-gray-900/35 border-gray-800/80 opacity-80'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        {/* Toggle + Título */}
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={cheat.enabled}
                            aria-label={`${cheat.enabled ? 'Desactivar' : 'Activar'} truco ${cheat.name}`}
                            onClick={() => onToggleCheat(cheat.id)}
                            className={`mt-0.5 relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-500/50 ${
                              cheat.enabled ? 'bg-emerald-500' : 'bg-gray-700'
                            }`}
                          >
                            <span
                              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                                cheat.enabled ? 'translate-x-4.5' : 'translate-x-1'
                              }`}
                            />
                          </button>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`text-xs sm:text-sm font-bold break-words ${
                                  cheat.enabled ? 'text-white' : 'text-gray-400'
                                }`}
                              >
                                {cheat.name}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
                                  cheat.enabled
                                    ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-700/40'
                                    : 'bg-gray-800 text-gray-400 border border-gray-700/50'
                                }`}
                              >
                                {cheat.enabled ? 'Activo' : 'Inactivo'}
                              </span>
                              {lines.length > 1 && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-purple-950/50 text-purple-300 border border-purple-800/40">
                                  {lines.length} líneas
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Acciones Editar / Eliminar */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(cheat)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-amber-300 hover:bg-gray-800 transition-colors cursor-pointer"
                            title="Editar truco"
                            aria-label={`Editar ${cheat.name}`}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (editingId === cheat.id) resetForm();
                              onDeleteCheat(cheat.id);
                            }}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-gray-800 transition-colors cursor-pointer"
                            title="Eliminar truco"
                            aria-label={`Eliminar ${cheat.name}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Vista resumida del código */}
                      <div className="pl-12">
                        <div className="rounded-lg bg-black/45 border border-gray-800/80 px-2.5 py-1.5 font-mono text-[11px] text-emerald-300/90 leading-relaxed whitespace-pre-wrap break-all select-text">
                          {previewLines.join('\n')}
                          {!isExpanded && isMultiline && (
                            <span className="text-gray-500">
                              {`\n… (+${lines.length - 2} ${lines.length - 2 === 1 ? 'línea más' : 'líneas más'})`}
                            </span>
                          )}
                        </div>
                        {isMultiline && (
                          <button
                            type="button"
                            onClick={() => toggleExpand(cheat.id)}
                            className="mt-1 text-[10px] font-mono text-purple-400 hover:text-purple-300 flex items-center gap-1 cursor-pointer"
                          >
                            {isExpanded ? (
                              <>
                                <ChevronUp size={11} /> Ocultar líneas
                              </>
                            ) : (
                              <>
                                <ChevronDown size={11} /> Ver las {lines.length} líneas completas
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* FOOTER */}
        <div className="px-4 sm:px-5 py-3 border-t border-gray-800/80 bg-[#161920] flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <p className="text-[10px] sm:text-[11px] text-gray-400 font-mono text-center sm:text-left">
            Los trucos se aplican en caliente sobre <span className="text-purple-300">/data/cheats</span> y se guardan por ROM.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold text-xs cursor-pointer transition-colors shrink-0"
          >
            Volver al juego
          </button>
        </div>
      </div>
    </div>
  );
};
