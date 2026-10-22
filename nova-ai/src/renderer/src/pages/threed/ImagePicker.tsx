// Image input of "Bild zu 3D": native file dialog (<input type="file">), drag & drop and Ctrl+V. The image is read in
// the renderer (File API) so it can be previewed and checked (PNG/JPEG/WebP, ≤ 20 MB) before it is sent as base64.
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { ImagePlus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui';
import { cn } from '../../lib/cn';
import { formatBytes } from '../../lib/format';
import { IMAGE_ACCEPT, ImageCheckError, readImageFile, type PickedImage } from './threedUtils';

export interface ImagePickerProps {
  value: PickedImage | null;
  onChange: (image: PickedImage | null) => void;
  error: string | null;
  onError: (message: string | null) => void;
  disabled?: boolean;
}

/** First image file of a drop or paste. */
function imageFileOf(list: FileList | File[] | null | undefined): File | null {
  if (!list) return null;
  for (const f of Array.from(list)) if (!f.type || f.type.startsWith('image/')) return f;
  return null;
}

export function ImagePicker({ value, onChange, error, onError, disabled }: ImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const preview = usePreviewUrl(value);
  const handlersRef = useRef({ onChange, onError });
  handlersRef.current = { onChange, onError };

  const handleFile = async (file: File) => {
    setReading(true);
    handlersRef.current.onError(null);
    try {
      const img = await readImageFile(file);
      setDims(null);
      handlersRef.current.onChange(img);
    } catch (e) {
      handlersRef.current.onError(e instanceof ImageCheckError ? e.message : 'Das Bild konnte nicht gelesen werden.');
    } finally {
      setReading(false);
    }
  };
  const handleFileRef = useRef(handleFile);
  handleFileRef.current = handleFile;

  // Ctrl+V anywhere on the page while "Bild zu 3D" is open.
  useEffect(() => {
    if (disabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const file = imageFileOf(e.clipboardData?.files);
      if (!file) return;
      e.preventDefault();
      void handleFileRef.current(file);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [disabled]);

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const file = imageFileOf(e.dataTransfer?.files);
    if (file) void handleFile(file);
    else onError('Bitte eine Bilddatei hierher ziehen (PNG, JPEG oder WebP).');
  };

  const choose = () => inputRef.current?.click();

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-text" id="threed-image-label">
        Bild
      </p>
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-label="Bilddatei auswählen"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void handleFile(file);
        }}
      />
      <div
        role="group"
        aria-labelledby="threed-image-label"
        aria-describedby="threed-image-hint"
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        data-testid="threed-dropzone"
        className={cn(
          'rounded-lg border border-dashed transition-colors duration-150',
          dragging ? 'border-violet bg-violet/10' : error ? 'border-danger/70 bg-surface-2/40' : 'border-border-strong bg-surface-2/40',
        )}
      >
        {value ? (
          <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
            <div className="flex h-36 w-full shrink-0 items-center justify-center overflow-hidden rounded-md bg-white sm:w-44">
              {preview && (
                <img
                  src={preview}
                  alt={`Vorschau: ${value.name}`}
                  className="max-h-full max-w-full object-contain"
                  onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                />
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <p className="truncate text-[13px] font-medium text-text" title={value.name}>
                  {value.name}
                </p>
                <p className="text-xs text-muted">
                  {value.mimeType.replace('image/', '').toUpperCase()} · {formatBytes(value.sizeBytes)}
                  {dims && dims.w > 0 ? ` · ${dims.w} × ${dims.h} Pixel` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" icon={RefreshCw} onClick={choose} loading={reading} disabled={disabled}>
                  Anderes Bild …
                </Button>
                <Button size="sm" variant="ghost" icon={Trash2} onClick={() => onChange(null)} disabled={disabled}>
                  Entfernen
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-violet/10 text-violet-fg">
              <ImagePlus aria-hidden className="h-5 w-5" />
            </span>
            <p className="text-[13px] text-text">Bild hierher ziehen oder mit Strg+V einfügen</p>
            <Button size="sm" variant="subtle" icon={ImagePlus} onClick={choose} loading={reading} disabled={disabled}>
              Bild auswählen …
            </Button>
          </div>
        )}
      </div>
      {error ? (
        <p id="threed-image-hint" className="text-xs text-danger-fg" role="alert">
          {error}
        </p>
      ) : (
        <p id="threed-image-hint" className="text-xs text-muted">
          PNG, JPEG oder WebP, höchstens 20 MB. Am besten klappt es mit einem einzelnen Objekt – vollständig sichtbar, gut beleuchtet, vor schlichtem Hintergrund.
        </p>
      )}
    </div>
  );
}

/** Object URL of the picked file (cheap, revoked on change), or a data: URL where object URLs are unavailable. */
function usePreviewUrl(image: PickedImage | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!image) {
      setUrl(null);
      return;
    }
    if (image.blob && typeof URL.createObjectURL === 'function') {
      const objectUrl = URL.createObjectURL(image.blob);
      setUrl(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
    }
    setUrl(`data:${image.mimeType};base64,${image.base64}`);
  }, [image]);
  return url;
}
