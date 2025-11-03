import React from 'react';
import { Settings, Undo, Redo, Save } from 'lucide-react';
import { useEditorStore } from '../../state/editorStore';
import './PreviewHeader.css';

interface PreviewHeaderProps {
  onSettingsClick: () => void;
}

/**
 * PreviewHeader - Top bar with controls (Kando style)
 */
export function PreviewHeader({ onSettingsClick }: PreviewHeaderProps) {
  const canUndo = useEditorStore((state) => state.past.length > 0);
  const canRedo = useEditorStore((state) => state.future.length > 0);
  const { undo, redo } = useEditorStore();
  const currentMenu = useEditorStore((state) => state.present.menu);

  return (
    <div className="preview-header">
      {/* Left Side - Menu Title */}
      <div className="header-left">
        <h1 className="menu-title-display">{currentMenu.title || 'Untitled Menu'}</h1>
      </div>

      {/* Right Side - Actions */}
      <div className="header-right">
        {/* Undo/Redo */}
        <div className="button-group">
          <button
            className="header-button"
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
          >
            <Undo size={18} />
          </button>
          <button
            className="header-button"
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
          >
            <Redo size={18} />
          </button>
        </div>

        {/* Settings */}
        <button
          className="header-button settings-button"
          onClick={onSettingsClick}
          title="Settings (Ctrl+,)"
        >
          <Settings size={18} />
        </button>
      </div>
    </div>
  );
}
