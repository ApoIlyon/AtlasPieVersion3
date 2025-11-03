import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProfileStore } from '../../state/profileStore';
import { useEditorStore } from '../../state/editorStore';
import { Plus, Menu as MenuIcon, Trash2, Copy, ChevronRight } from 'lucide-react';
import './MenuList.css';

/**
 * MenuList - Left sidebar showing all profiles and menus (Kando style)
 */
export function MenuList() {
  const profiles = useProfileStore((state) => state.profiles);
  const saveProfile = useProfileStore((state) => state.saveProfile);
  const deleteProfile = useProfileStore((state) => state.deleteProfile);
  const { loadMenu } = useEditorStore();
  
  const [expandedProfileId, setExpandedProfileId] = useState<string | null>(
    profiles.length > 0 ? profiles[0].profile.id : null
  );
  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);

  const handleCreateProfile = async () => {
    const newProfile = {
      id: crypto.randomUUID(),
      name: `Profile ${profiles.length + 1}`,
      enabled: true,
      rootMenu: crypto.randomUUID(),
      contextRules: [],
    };

    const rootMenu = {
      id: newProfile.rootMenu,
      title: 'Main Menu',
      slices: [
        {
          id: crypto.randomUUID(),
          label: 'Item 1',
          order: 0,
          action: null,
          childMenu: null,
        },
        {
          id: crypto.randomUUID(),
          label: 'Item 2',
          order: 1,
          action: null,
          childMenu: null,
        },
      ],
    };

    await saveProfile({
      profile: newProfile,
      menus: [rootMenu],
    });

    setExpandedProfileId(newProfile.id);
  };

  const handleDeleteProfile = async (profileId: string) => {
    if (confirm('Delete this profile?')) {
      await deleteProfile(profileId);
      if (expandedProfileId === profileId) {
        setExpandedProfileId(profiles[0]?.profile.id || null);
      }
    }
  };

  const handleSelectMenu = (profile: typeof profiles[0], menuId: string) => {
    const menu = profile.menus.find(m => m.id === menuId);
    if (menu) {
      loadMenu({
        id: menu.id,
        title: menu.title || 'Menu',
        slices: menu.slices.map(s => ({
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
      setSelectedMenuId(menuId);
    }
  };

  const handleDuplicateProfile = async (profile: typeof profiles[0]) => {
    const newProfile = {
      ...profile.profile,
      id: crypto.randomUUID(),
      name: `${profile.profile.name} (Copy)`,
    };

    await saveProfile({
      profile: newProfile,
      menus: profile.menus.map(menu => ({
        ...menu,
        id: crypto.randomUUID(),
      })),
    });
  };

  return (
    <div className="menu-list">
      {/* Header */}
      <div className="menu-list-header">
        <h2 className="menu-list-title">
          <MenuIcon size={18} />
          Menus
        </h2>
        <button
          className="icon-button"
          onClick={handleCreateProfile}
          title="Create new profile"
        >
          <Plus size={18} />
        </button>
      </div>

      {/* Profile List */}
      <div className="menu-list-content">
        {profiles.length === 0 ? (
          <div className="empty-state">
            <MenuIcon size={48} opacity={0.3} />
            <p>No profiles yet</p>
            <button className="primary-button" onClick={handleCreateProfile}>
              <Plus size={16} />
              Create Profile
            </button>
          </div>
        ) : (
          <AnimatePresence>
            {profiles.map((profile) => (
              <motion.div
                key={profile.profile.id}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="profile-item"
              >
                {/* Profile Header */}
                <div
                  className={`profile-header ${
                    expandedProfileId === profile.profile.id ? 'expanded' : ''
                  }`}
                  onClick={() =>
                    setExpandedProfileId(
                      expandedProfileId === profile.profile.id
                        ? null
                        : profile.profile.id
                    )
                  }
                >
                  <ChevronRight
                    size={16}
                    className={`chevron ${
                      expandedProfileId === profile.profile.id ? 'rotated' : ''
                    }`}
                  />
                  <span className="profile-name">{profile.profile.name}</span>
                  <div className="profile-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="icon-button-small"
                      onClick={() => handleDuplicateProfile(profile)}
                      title="Duplicate"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      className="icon-button-small danger"
                      onClick={() => handleDeleteProfile(profile.profile.id)}
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Menus */}
                <AnimatePresence>
                  {expandedProfileId === profile.profile.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="menu-items"
                    >
                      {profile.menus.map((menu) => (
                        <div
                          key={menu.id}
                          className={`menu-item ${
                            selectedMenuId === menu.id ? 'selected' : ''
                          }`}
                          onClick={() => handleSelectMenu(profile, menu.id)}
                        >
                          <MenuIcon size={14} opacity={0.7} />
                          <span className="menu-title">{menu.title || 'Untitled Menu'}</span>
                          <span className="menu-badge">{menu.slices.length}</span>
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
