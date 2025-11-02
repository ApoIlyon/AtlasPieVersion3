import { useCallback, useEffect, useState } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { useEditorStore, selectCurrentMenu, selectSelectedSlice, selectCanUndo, selectCanRedo } from '../../state/editorStore';
import { useProfileStore } from '../../state/profileStore';
import { EditorCanvas } from './EditorCanvas';
import { SegmentList } from './SegmentList';
import { SegmentProperties } from './SegmentProperties';
import { MenuBreadcrumb } from './MenuBreadcrumb';
import { EditorToolbar } from './EditorToolbar';
import type { PieSlice } from '../../state/editorStore';

export interface VisualMenuEditorProps {
  profileId?: string;
  onClose?: () => void;
  onSave?: () => void;
  onCancel?: () => void;
}

export function VisualMenuEditor({ profileId, onClose, onSave, onCancel }: VisualMenuEditorProps) {
  const profiles = useProfileStore((state) => state.profiles);
  const menu = useEditorStore(selectCurrentMenu);
  const selectedSlice = useEditorStore(selectSelectedSlice);
  const canUndo = useEditorStore(selectCanUndo);
  const canRedo = useEditorStore(selectCanRedo);
  const { selectSlice, reorderSlices, undo, redo, validate, loadMenu } = useEditorStore();

  const [activeSliceId, setActiveSliceId] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Load profile data into editor store
  useEffect(() => {
    if (!profileId) return;
    
    const profile = profiles.find(p => p.profile.id === profileId);
    if (!profile || !profile.menus || profile.menus.length === 0) return;
    
    const rootMenuId = profile.profile.rootMenu || profile.menus[0]?.id;
    const rootMenu = profile.menus.find(m => m.id === rootMenuId) || profile.menus[0];
    
    if (rootMenu) {
      loadMenu({
        id: rootMenu.id,
        title: rootMenu.title || 'Menu',
        slices: rootMenu.slices.map(s => ({
          id: s.id,
          label: s.label || 'Untitled',
          order: s.order ?? 0,
          icon: undefined,
          actionId: s.action || undefined,
          childMenuId: s.childMenu || undefined,
          disabled: !s.action && !s.childMenu,
          accentColor: undefined,
        })),
      });
    }
  }, [profileId, profiles, loadMenu]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Undo: Ctrl+Z
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) undo();
      }
      // Redo: Ctrl+Shift+Z or Ctrl+Y
      if ((e.ctrlKey && e.shiftKey && e.key === 'z') || (e.ctrlKey && e.key === 'y')) {
        e.preventDefault();
        if (canRedo) redo();
      }
      // Save: Ctrl+S
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
      // Escape: Deselect
      if (e.key === 'Escape') {
        selectSlice(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndo, canRedo, undo, redo, selectSlice]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveSliceId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveSliceId(null);

      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = menu.slices.findIndex((s) => s.id === active.id);
      const newIndex = menu.slices.findIndex((s) => s.id === over.id);

      if (oldIndex === -1 || newIndex === -1) return;

      const newOrder = [...menu.slices];
      const [moved] = newOrder.splice(oldIndex, 1);
      newOrder.splice(newIndex, 0, moved);

      reorderSlices(newOrder.map((s) => s.id));
    },
    [menu.slices, reorderSlices]
  );

  const handleSave = useCallback(() => {
    const validation = validate();
    if (!validation.isValid) {
      setValidationErrors(validation.errors);
      return;
    }
    setValidationErrors([]);
    onSave?.();
  }, [validate, onSave]);

  const handleCancel = useCallback(() => {
    onCancel?.();
  }, [onCancel]);

  return (
    <div className="flex h-full flex-col bg-[#090a13]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 bg-white/5 px-6 py-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Visual Menu Editor</h2>
          <p className="text-xs text-white/60 mt-1">Drag segments to reorder, click to edit properties</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/70 transition hover:border-white/20 hover:bg-white/10"
          >
            ✕ Close
          </button>
        )}
      </div>

      {/* Toolbar */}
      <EditorToolbar
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        onSave={handleSave}
        onCancel={handleCancel}
      />

      {/* Breadcrumb Navigation */}
      <div className="border-b border-white/5 bg-white/5 px-6 py-3">
        <MenuBreadcrumb menuTitle={menu.title} />
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Segment List */}
        <div className="w-80 border-r border-white/5 bg-white/5 overflow-y-auto">
          <div className="p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white/60">
              Segments ({menu.slices.length}/12)
            </h3>
            
            <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <SortableContext
                items={menu.slices.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                <SegmentList
                  slices={menu.slices}
                  selectedId={selectedSlice?.id ?? null}
                  onSelect={selectSlice}
                />
              </SortableContext>

              <DragOverlay>
                {activeSliceId && (
                  <div className="rounded-lg border border-accent/60 bg-accent/10 p-3 shadow-glow-md">
                    {menu.slices.find((s) => s.id === activeSliceId)?.label}
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          </div>
        </div>

        {/* Center - Canvas Preview */}
        <div className="flex-1 flex flex-col items-center justify-center bg-[#111111] p-8">
          <EditorCanvas menu={menu} selectedSliceId={selectedSlice?.id ?? null} />
          
          {/* Validation Errors */}
          <AnimatePresence>
            {validationErrors.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="mt-4 max-w-md rounded-lg border border-rose-500/50 bg-rose-500/10 p-4"
              >
                <h4 className="text-sm font-semibold text-rose-100">Validation Errors:</h4>
                <ul className="mt-2 space-y-1">
                  {validationErrors.map((error, i) => (
                    <li key={i} className="text-xs text-rose-200/80">
                      • {error}
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Sidebar - Properties */}
        <div className="w-80 border-l border-white/5 bg-white/5 overflow-y-auto">
          <SegmentProperties slice={selectedSlice} />
        </div>
      </div>

      {/* Status Bar */}
      <div className="border-t border-white/5 bg-white/5 px-6 py-2 text-xs text-white/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span>Menu: {menu.title}</span>
            <span>•</span>
            <span>{menu.slices.length} segments</span>
            {selectedSlice && (
              <>
                <span>•</span>
                <span className="text-accent">Selected: {selectedSlice.label}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <kbd className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 text-[10px]">
              Ctrl+Z
            </kbd>
            <span>Undo</span>
            <span>•</span>
            <kbd className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 text-[10px]">
              Ctrl+Shift+Z
            </kbd>
            <span>Redo</span>
            <span>•</span>
            <kbd className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 text-[10px]">
              Ctrl+S
            </kbd>
            <span>Save</span>
          </div>
        </div>
      </div>
    </div>
  );
}
