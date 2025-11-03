import React from 'react';
import { Keyboard, Info } from 'lucide-react';
import './PreviewFooter.css';

/**
 * PreviewFooter - Bottom bar with shortcuts and info (Kando style)
 */
export function PreviewFooter() {
  const shortcuts = [
    { keys: ['Ctrl', 'Z'], label: 'Undo' },
    { keys: ['Ctrl', 'Y'], label: 'Redo' },
    { keys: ['Ctrl', ','], label: 'Settings' },
    { keys: ['Alt', 'Q'], label: 'Show Menu' },
  ];

  return (
    <div className="preview-footer">
      {/* Shortcuts */}
      <div className="footer-shortcuts">
        <Keyboard size={14} />
        {shortcuts.map((shortcut, index) => (
          <div key={index} className="shortcut-item">
            <div className="shortcut-keys">
              {shortcut.keys.map((key, i) => (
                <React.Fragment key={i}>
                  <kbd className="key">{key}</kbd>
                  {i < shortcut.keys.length - 1 && <span className="plus">+</span>}
                </React.Fragment>
              ))}
            </div>
            <span className="shortcut-label">{shortcut.label}</span>
          </div>
        ))}
      </div>

      {/* Info */}
      <div className="footer-info">
        <Info size={14} />
        <span>AtlasPie v0.1.3</span>
      </div>
    </div>
  );
}
