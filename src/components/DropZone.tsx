import React, { useEffect, useRef, useState } from 'react';

/** A drop area for files: drag files onto it, click (or press Enter) to browse, or paste a picture. */
export function DropZone({ accept, multiple, onFiles, label, hint, disabled, compact }: { accept?: string; multiple?: boolean; onFiles: (f: File[]) => void; label: React.ReactNode; hint?: React.ReactNode; disabled?: boolean; compact?: boolean }) {
  const [over, setOver] = useState(false);
  const inp = useRef<HTMLInputElement>(null), box = useRef<HTMLDivElement>(null);
  const take = (l: FileList | File[] | null | undefined) => { const a = l ? Array.from(l) : []; if (a.length && !disabled) onFiles(multiple ? a : a.slice(0, 1)); };
  useEffect(() => {
    const el = box.current; if (!el) return;
    const paste = (e: ClipboardEvent) => { if (document.activeElement === el && e.clipboardData?.files.length) { e.preventDefault(); take(e.clipboardData.files); } };
    window.addEventListener('paste', paste); return () => window.removeEventListener('paste', paste);
  });
  return (
    <div ref={box} className={'drop-zone' + (over ? ' over' : '') + (disabled ? ' disabled' : '') + (compact ? ' compact' : '')} role="button" tabIndex={0} aria-disabled={disabled} data-drop-own
      onClick={() => !disabled && inp.current?.click()} onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !disabled) { e.preventDefault(); inp.current?.click(); } }}
      onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setOver(true); }} onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); }}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(false); take(e.dataTransfer.files); }}>
      <div className="drop-icon" aria-hidden>⤓</div>
      <div><b>{label}</b><div className="small muted">{over ? 'Drop to upload' : <>Drag and drop here, or <u>browse</u>{hint ? <> · {hint}</> : null}</>}</div></div>
      <input ref={inp} type="file" accept={accept} multiple={multiple} hidden data-drop-own onChange={(e) => { take(e.target.files); e.target.value = ''; }} />
    </div>
  );
}

/** Drag and drop for every upload field in the app: dropping files on a card, label or button that holds a file
 *  input fills that input, as if the files were picked with Browse. Elsewhere, dropping does nothing (it never
 *  replaces the app with the file). */
export function GlobalFileDrop() {
  useEffect(() => {
    let lit: HTMLElement | null = null;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
    const targetOf = (t: EventTarget | null): { host: HTMLElement; input: HTMLInputElement } | null => {
      let el = t instanceof Element ? t as HTMLElement : null;
      while (el && el !== document.body) {
        if (el.matches('[data-drop-own]')) return null;
        const input = el.matches('input[type=file]') ? el as HTMLInputElement : el.querySelector<HTMLInputElement>('input[type=file]:not([disabled]):not([data-drop-own])');
        if (input && (el.matches('label, .card, .field, .drop-target, fieldset, td, section, .row') || el === input)) return { host: el.matches('.card') ? el : (el.closest('.card') as HTMLElement) ?? el, input };
        el = el.parentElement;
      }
      return null;
    };
    const light = (h: HTMLElement | null) => { if (lit === h) return; lit?.classList.remove('drag-over'); lit = h; lit?.classList.add('drag-over'); };
    const over = (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); const t = targetOf(e.target); if (e.dataTransfer) e.dataTransfer.dropEffect = t ? 'copy' : 'none'; light(t?.host ?? null); };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return; e.preventDefault(); light(null);
      const t = targetOf(e.target); if (!t || !e.dataTransfer) return;
      const dt = new DataTransfer(); const files = Array.from(e.dataTransfer.files);
      for (const f of t.input.multiple ? files : files.slice(0, 1)) dt.items.add(f);
      t.input.files = dt.files; t.input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const leave = (e: DragEvent) => { if (!e.relatedTarget) light(null); };
    window.addEventListener('dragover', over); window.addEventListener('drop', drop); window.addEventListener('dragleave', leave);
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('drop', drop); window.removeEventListener('dragleave', leave); };
  }, []);
  return null;
}
