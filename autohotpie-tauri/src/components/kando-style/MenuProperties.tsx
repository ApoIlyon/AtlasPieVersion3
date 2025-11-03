import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, GripVertical, Edit3, Check, X } from 'lucide-react';
import { useEditorStore } from '../../state/editorStore';
import { ActionSelector } from '../actions/ActionSelector';
import './MenuProperties.css';

/**
 * MenuProperties - Right sidebar for editing menu properties (Kando style)
 */
export function MenuProperties() {
  const currentMenu = useEditorStore((state) => state.present.menu);
  const selectedSlice = useEditorStore((state) => 
    currentMenu.slices.find(s => s.id === state.present.selectedSliceId)
  );
  const { addSlice, updateSlice, deleteSlice, selectSlice } = useEditorStore();

  const [editingSliceId, setEditingSliceId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [showActionSelector, setShowActionSelector] = useState(false);
  const [actionSliceId, setActionSliceId] = useState<string | null>(null);

  const handleAddSlice = () => {
    const newSlice = {
      id: crypto.randomUUID(),
      label: `Item ${currentMenu.slices.length + 1}`,
      order: currentMenu.slices.length,
      icon: undefined,
      actionId: undefined,
      childMenuId: undefined,
      disabled: false,
      accentColor: '#35B1FF',
    };
    addSlice(newSlice);
    selectSlice(newSlice.id);
  };

  const handleStartEdit = (slice: typeof currentMenu.slices[0]) => {
    setEditingSliceId(slice.id);
    setEditingLabel(slice.label);
  };

  const handleSaveEdit = (sliceId: string) => {
    if (editingLabel.trim()) {
      updateSlice(sliceId, { label: editingLabel.trim() });
    }
    setEditingSliceId(null);
  };

  const handleCancelEdit = () => {
    setEditingSliceId(null);
    setEditingLabel('');
  };

  const handleDeleteSlice = (sliceId: string) => {
    if (confirm('Delete this slice?')) {
      deleteSlice(sliceId);
    }
  };

  const handleSetAction = (sliceId: string) => {
    setActionSliceId(sliceId);
    setShowActionSelector(true);
  };

  const canAddMore = currentMenu.slices.length < 12;

  return (
    <div className="menu-properties">
      {/* Header */}
      <div className="properties-header">
        <h2 className="properties-title">Properties</h2>
        <button
          className="icon-button"
          onClick={handleAddSlice}
          disabled={!canAddMore}
          title={canAddMore ? 'Add slice' : 'Maximum 12 slices'}
        >
          <Plus size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="properties-content">
        {currentMenu.slices.length === 0 ? (
          <div className="empty-properties">
            <Plus size={48} opacity={0.3} />
            <p>No slices yet</p>
            <button className="primary-button" onClick={handleAddSlice}>
              <Plus size={16} />
              Add Slice
            </button>
          </div>
        ) : (
          <>
            {/* Slices List */}
            <div className="slices-section">
              <h3 className="section-title">
                Slices ({currentMenu.slices.length}/12)
              </h3>
              
              <div className="slices-list">
                <AnimatePresence>
                  {currentMenu.slices.map((slice, index) => (
                    <motion.div
                      key={slice.id}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className={`slice-item ${
                        selectedSlice?.id === slice.id ? 'selected' : ''
                      }`}
                      onClick={() => selectSlice(slice.id)}
                    >
                      {/* Drag Handle */}
                      <div className="drag-handle">
                        <GripVertical size={16} />
                      </div>

                      {/* Content */}
                      <div className="slice-content">
                        {editingSliceId === slice.id ? (
                          <input
                            type="text"
                            className="slice-input"
                            value={editingLabel}
                            onChange={(e) => setEditingLabel(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit(slice.id);
                              if (e.key === 'Escape') handleCancelEdit();
                            }}
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span className="slice-label">{slice.label}</span>
                        )}
                        
                        {slice.actionId && (
                          <span className="action-badge">Action</span>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="slice-actions" onClick={(e) => e.stopPropagation()}>
                        {editingSliceId === slice.id ? (
                          <>
                            <button
                              className="icon-button-tiny success"
                              onClick={() => handleSaveEdit(slice.id)}
                              title="Save"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              className="icon-button-tiny"
                              onClick={handleCancelEdit}
                              title="Cancel"
                            >
                              <X size={14} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="icon-button-tiny"
                              onClick={() => handleStartEdit(slice)}
                              title="Edit label"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              className="icon-button-tiny danger"
                              onClick={() => handleDeleteSlice(slice.id)}
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>

            {/* Selected Slice Details */}
            {selectedSlice && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="slice-details-section"
              >
                <h3 className="section-title">Details</h3>
                
                <div className="details-content">
                  <div className="detail-row">
                    <label className="detail-label">Label</label>
                    <div className="detail-value">{selectedSlice.label}</div>
                  </div>

                  <div className="detail-row">
                    <label className="detail-label">Action</label>
                    <button
                      className="set-action-button"
                      onClick={() => handleSetAction(selectedSlice.id)}
                    >
                      {selectedSlice.actionId ? '✏️ Edit Action' : '➕ Set Action'}
                    </button>
                  </div>

                  {selectedSlice.actionId && (
                    <div className="detail-row">
                      <label className="detail-label">Action ID</label>
                      <div className="detail-value mono">{selectedSlice.actionId}</div>
                    </div>
                  )}

                  <div className="detail-row">
                    <label className="detail-label">Accent Color</label>
                    <input
                      type="color"
                      className="color-picker"
                      value={selectedSlice.accentColor || '#35B1FF'}
                      onChange={(e) =>
                        updateSlice(selectedSlice.id, { accentColor: e.target.value })
                      }
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </>
        )}
      </div>

      {/* Action Selector Modal */}
      <AnimatePresence>
        {showActionSelector && actionSliceId && (
          <ActionSelector
            currentAction={null}
            onActionChange={async (action) => {
              if (action) {
                const actionString = `${action.type}:${JSON.stringify(action.data)}`;
                updateSlice(actionSliceId, { actionId: actionString });
              }
              setShowActionSelector(false);
              setActionSliceId(null);
            }}
            onClose={() => {
              setShowActionSelector(false);
              setActionSliceId(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
