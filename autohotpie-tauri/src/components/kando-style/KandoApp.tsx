import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProfileStore } from '../../state/profileStore';
import { useEditorStore } from '../../state/editorStore';
import { MenuList } from './MenuList';
import { MenuPreview } from './MenuPreview';
import { MenuProperties } from './MenuProperties';
import { PreviewHeader } from './PreviewHeader';
import { PreviewFooter } from './PreviewFooter';
import { SettingsDialog } from './SettingsDialog';
import './KandoApp.css';

/**
 * KandoApp - Main editor interface styled like Kando
 * 
 * Layout:
 * ┌─────────────────────────────────────────────┐
 * │ [Left]    [Center]         [Right]          │
 * │ MenuList  Preview          Properties       │
 * │           (Canvas)         (Editing)        │
 * └─────────────────────────────────────────────┘
 */
export function KandoApp() {
  const profiles = useProfileStore((state) => state.profiles);
  const currentMenu = useEditorStore((state) => state.present.menu);
  const [showSettings, setShowSettings] = React.useState(false);

  // Global shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Undo: Ctrl+Z
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        useEditorStore.getState().undo();
      }
      // Redo: Ctrl+Y or Ctrl+Shift+Z
      if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
        e.preventDefault();
        useEditorStore.getState().redo();
      }
      // Settings: Ctrl+,
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault();
        setShowSettings(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="kando-app">
      {/* Left Sidebar - Menu List */}
      <aside className="kando-sidebar kando-sidebar-left">
        <MenuList />
      </aside>

      {/* Center Area - Menu Preview */}
      <main className="kando-center">
        <PreviewHeader onSettingsClick={() => setShowSettings(true)} />
        <div className="kando-preview-container">
          <MenuPreview menu={currentMenu} />
        </div>
        <PreviewFooter />
      </main>

      {/* Right Sidebar - Properties */}
      <aside className="kando-sidebar kando-sidebar-right">
        <MenuProperties />
      </aside>

      {/* Settings Dialog */}
      <AnimatePresence>
        {showSettings && (
          <SettingsDialog onClose={() => setShowSettings(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
