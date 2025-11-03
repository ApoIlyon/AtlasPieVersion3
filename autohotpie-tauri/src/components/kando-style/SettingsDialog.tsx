import React from 'react';
import { motion } from 'framer-motion';
import { X, Palette, Keyboard as KeyboardIcon, Info } from 'lucide-react';
import './SettingsDialog.css';

interface SettingsDialogProps {
  onClose: () => void;
}

/**
 * SettingsDialog - Modal for app settings (Kando style)
 */
export function SettingsDialog({ onClose }: SettingsDialogProps) {
  return (
    <>
      {/* Backdrop */}
      <motion.div
        className="settings-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />

      {/* Dialog */}
      <motion.div
        className="settings-dialog"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      >
        {/* Header */}
        <div className="dialog-header">
          <h2 className="dialog-title">Settings</h2>
          <button className="close-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="dialog-content">
          {/* Appearance Section */}
          <div className="settings-section">
            <div className="section-header">
              <Palette size={18} />
              <h3>Appearance</h3>
            </div>
            <div className="settings-group">
              <label className="setting-item">
                <span className="setting-label">Theme</span>
                <select className="setting-select">
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                  <option value="system">System</option>
                </select>
              </label>
              <label className="setting-item">
                <span className="setting-label">Accent Color</span>
                <input type="color" className="setting-color" defaultValue="#35B1FF" />
              </label>
            </div>
          </div>

          {/* Hotkeys Section */}
          <div className="settings-section">
            <div className="section-header">
              <KeyboardIcon size={18} />
              <h3>Hotkeys</h3>
            </div>
            <div className="settings-group">
              <label className="setting-item">
                <span className="setting-label">Global Hotkey</span>
                <input
                  type="text"
                  className="setting-input"
                  defaultValue="Alt+Q"
                  readOnly
                />
              </label>
              <p className="setting-hint">
                Press the key combination you want to use
              </p>
            </div>
          </div>

          {/* About Section */}
          <div className="settings-section">
            <div className="section-header">
              <Info size={18} />
              <h3>About</h3>
            </div>
            <div className="settings-group">
              <div className="about-info">
                <p><strong>AtlasPie</strong></p>
                <p className="version">Version 0.1.3</p>
                <p className="description">
                  A Kando-inspired radial menu for Windows
                </p>
                <div className="links">
                  <a href="#" className="link">Documentation</a>
                  <a href="#" className="link">GitHub</a>
                  <a href="#" className="link">Report Issue</a>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="dialog-footer">
          <button className="secondary-button" onClick={onClose}>
            Close
          </button>
        </div>
      </motion.div>
    </>
  );
}
