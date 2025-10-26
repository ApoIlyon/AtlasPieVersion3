import { useCallback, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';

export type IconSourceKind = 'builtin' | 'user';

export interface IconAssetMeta {
  id: string;
  name: string;
  category: string;
  tags: string[];
  source: IconSourceKind;
  contrastHex?: string | null;
  previewUrl: string;
  createdAt?: string | null;
  license?: string | null;
}

export interface IconUploadRequest {
  file: File;
  dataUrl: string;
}

export interface IconManagerProps {
  icons: IconAssetMeta[];
  selectedIconId: string | null;
  onSelect: (iconId: string | null) => void;
  onUpload?: (payload: IconUploadRequest[]) => void;
  onDelete?: (iconId: string) => void;
  allowDelete?: boolean;
  allowUpload?: boolean;
}

export function IconManager({
  icons,
  selectedIconId,
  onSelect,
  onUpload,
  onDelete,
  allowDelete = true,
  allowUpload = true,
}: IconManagerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | IconSourceKind>('all');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragCounterRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  const categories = useMemo(() => {
    const unique = new Set<string>();
    icons.forEach((icon) => {
      if (icon.category.trim().length > 0) {
        unique.add(icon.category.trim());
      }
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [icons]);

  const filteredIcons = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return icons.filter((icon) => {
      const matchesCategory = categoryFilter === 'all' || icon.category === categoryFilter;
      const matchesSource = sourceFilter === 'all' || icon.source === sourceFilter;
      const matchesQuery = normalizedQuery.length === 0
        || icon.name.toLowerCase().includes(normalizedQuery)
        || icon.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery));
      return matchesCategory && matchesSource && matchesQuery;
    });
  }, [categoryFilter, icons, searchQuery, sourceFilter]);

  const selectedIcon = useMemo(
    () => (selectedIconId ? icons.find((icon) => icon.id === selectedIconId) ?? null : null),
    [icons, selectedIconId],
  );

  const handleUploadFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0 || !onUpload) {
        return;
      }
      const accepted = Array.from(files).filter((file) => /\.(svg|png)$/i.test(file.name));
      if (accepted.length === 0) {
        return;
      }

      const readers = await Promise.all(
        accepted.map(
          (file) =>
            new Promise<IconUploadRequest>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                resolve({
                  file,
                  dataUrl: typeof reader.result === 'string' ? reader.result : '',
                });
              };
              reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
              reader.readAsDataURL(file);
            }),
        ),
      ).catch(() => null);

      if (!readers) {
        return;
      }
      onUpload(readers);
    },
    [onUpload],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragging(false);
      void handleUploadFiles(event.dataTransfer.files);
    },
    [handleUploadFiles],
  );

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current += 1;
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleBrowseClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      void handleUploadFiles(event.target.files);
      event.target.value = '';
    },
    [handleUploadFiles],
  );

  const handleIconDelete = useCallback(
    (iconId: string) => {
      if (allowDelete && onDelete) {
        onDelete(iconId);
      }
    },
    [allowDelete, onDelete],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[420px,1fr]">
      <div className="space-y-4">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <input
                type="search"
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-white focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                placeholder="Search icons or tags"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              <select
                className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs uppercase tracking-[0.25em] text-white/60 focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                value={sourceFilter}
                onChange={(event) => setSourceFilter(event.target.value as 'all' | IconSourceKind)}
              >
                <option value="all">All sources</option>
                <option value="builtin">Builtin</option>
                <option value="user">User</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={clsx(
                  'rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.25em] transition',
                  categoryFilter === 'all'
                    ? 'border-accent/40 bg-accent/10 text-white'
                    : 'bg-black/30 text-white/60 hover:border-white/20 hover:text-white/80',
                )}
                onClick={() => setCategoryFilter('all')}
              >
                All categories
              </button>
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  className={clsx(
                    'rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.25em] transition',
                    categoryFilter === category
                      ? 'border-accent/40 bg-accent/10 text-white'
                      : 'bg-black/30 text-white/60 hover:border-white/20 hover:text-white/80',
                  )}
                  onClick={() => setCategoryFilter(category)}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div
          className={clsx(
            'relative flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/15 p-8 text-center transition',
            allowUpload ? 'bg-black/20 hover:border-accent/40 hover:bg-black/30' : 'bg-black/20 opacity-60',
            isDragging && 'border-accent/60 bg-accent/10',
          )}
          onDragEnter={allowUpload ? handleDragEnter : undefined}
          onDragLeave={allowUpload ? handleDragLeave : undefined}
          onDragOver={allowUpload ? handleDragOver : undefined}
          onDrop={allowUpload ? handleDrop : undefined}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".svg,.png"
            className="hidden"
            multiple
            onChange={handleFileInputChange}
          />
          <span className="text-sm text-white/70">
            {allowUpload
              ? 'Drag & drop icons here or browse to upload SVG / PNG'
              : 'Icon uploads disabled by policy'}
          </span>
          {allowUpload && (
            <button
              type="button"
              className="mt-4 rounded-2xl border border-white/10 px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/80 transition hover:border-accent/40 hover:text-white"
              onClick={handleBrowseClick}
            >
              Browse files
            </button>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Icon Library</h3>
            <span className="text-xs uppercase tracking-[0.25em] text-white/40">{filteredIcons.length} items</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredIcons.length === 0 && (
              <div className="col-span-full rounded-2xl border border-white/10 bg-black/20 p-6 text-center text-sm text-white/60">
                No icons match the current filters.
              </div>
            )}
            {filteredIcons.map((icon) => {
              const isSelected = icon.id === selectedIconId;
              return (
                <button
                  key={icon.id}
                  type="button"
                  className={clsx(
                    'group relative flex flex-col items-center gap-3 rounded-2xl border px-4 py-5 text-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                    isSelected
                      ? 'border-accent/60 bg-accent/15 text-white'
                      : 'border-white/10 bg-black/25 text-white/70 hover:border-white/20 hover:bg-black/35',
                  )}
                  onClick={() => onSelect(isSelected ? null : icon.id)}
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-white/10 bg-black/30">
                    <img
                      src={icon.previewUrl}
                      alt={icon.name}
                      className="h-8 w-8 object-contain"
                      draggable={false}
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/70">
                      {icon.name}
                    </p>
                    <p className="text-[0.65rem] uppercase tracking-[0.35em] text-white/40">{icon.category}</p>
                  </div>
                  <div className="flex items-center gap-2 text-[0.6rem] uppercase tracking-[0.3em] text-white/40">
                    <span className="rounded-full border border-white/10 px-2 py-0.5">
                      {icon.source === 'builtin' ? 'Builtin' : 'User'}
                    </span>
                    <span className="rounded-full border border-white/10 px-2 py-0.5">
                      {icon.tags.length} tags
                    </span>
                  </div>
                  {allowDelete && icon.source === 'user' && (
                    <button
                      type="button"
                      className="absolute right-3 top-3 rounded-full border border-white/10 bg-black/60 px-2 py-1 text-[0.6rem] uppercase tracking-[0.3em] text-white/50 transition hover:border-red-400/60 hover:text-red-300"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleIconDelete(icon.id);
                      }}
                    >
                      Delete
                    </button>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Preview</h3>
            {selectedIcon && (
              <span className="text-[0.65rem] uppercase tracking-[0.3em] text-white/40">
                {selectedIcon.source === 'builtin' ? 'Builtin asset' : 'User uploaded'}
              </span>
            )}
          </div>
          {!selectedIcon && (
            <div className="mt-6 rounded-2xl border border-dashed border-white/15 bg-black/30 p-10 text-center text-sm text-white/60">
              Select an icon from the library to preview details and contrast.
            </div>
          )}
          {selectedIcon && (
            <div className="mt-6 grid gap-6 lg:grid-cols-[280px,1fr]">
              <div className="flex flex-col items-center gap-4">
                <div className="flex h-32 w-32 items-center justify-center rounded-3xl border border-white/10 bg-black/40">
                  <img
                    src={selectedIcon.previewUrl}
                    alt={selectedIcon.name}
                    className="h-20 w-20 object-contain"
                    draggable={false}
                  />
                </div>
                <div className="flex flex-col items-center gap-2 text-center">
                  <p className="text-sm font-semibold uppercase tracking-[0.3em] text-white">
                    {selectedIcon.name}
                  </p>
                  <p className="text-[0.65rem] uppercase tracking-[0.3em] text-white/40">
                    {selectedIcon.tags.join(' · ') || 'No tags'}
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-xs text-white/70">
                    <p className="text-[0.6rem] uppercase tracking-[0.3em] text-white/40">Category</p>
                    <p className="mt-1 text-sm">{selectedIcon.category}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-xs text-white/70">
                    <p className="text-[0.6rem] uppercase tracking-[0.3em] text-white/40">Source</p>
                    <p className="mt-1 text-sm">{selectedIcon.source === 'builtin' ? 'Builtin library' : 'User upload'}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-xs text-white/70">
                    <p className="text-[0.6rem] uppercase tracking-[0.3em] text-white/40">Created</p>
                    <p className="mt-1 text-sm">{selectedIcon.createdAt ?? '—'}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-xs text-white/70">
                    <p className="text-[0.6rem] uppercase tracking-[0.3em] text-white/40">License</p>
                    <p className="mt-1 text-sm">{selectedIcon.license ?? '—'}</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-white/40">Contrast preview</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-[#0f172a] p-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/5">
                        <img src={selectedIcon.previewUrl} alt="Light" className="h-8 w-8 object-contain" />
                      </div>
                      <span className="text-[0.65rem] uppercase tracking-[0.3em] text-white/60">Dark 24%</span>
                    </div>
                    <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-[#1f2937] p-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/10">
                        <img src={selectedIcon.previewUrl} alt="Mid" className="h-8 w-8 object-contain" />
                      </div>
                      <span className="text-[0.65rem] uppercase tracking-[0.3em] text-white/60">Neutral 40%</span>
                    </div>
                    <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-[#f8fafc] p-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-black/10">
                        <img src={selectedIcon.previewUrl} alt="Light" className="h-8 w-8 object-contain" />
                      </div>
                      <span className="text-[0.65rem] uppercase tracking-[0.3em] text-slate-500">Light 92%</span>
                    </div>
                  </div>
                  {selectedIcon.contrastHex && (
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-xs text-white/70">
                      <p className="text-[0.6rem] uppercase tracking-[0.3em] text-white/40">Primary swatch</p>
                      <div className="mt-3 flex items-center gap-3">
                        <div
                          className="h-8 w-8 rounded-full border border-white/10"
                          style={{ backgroundColor: selectedIcon.contrastHex }}
                        />
                        <span>{selectedIcon.contrastHex}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
