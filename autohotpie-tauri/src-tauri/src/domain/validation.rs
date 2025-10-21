use super::{Action, ActionId, PieMenu, PieMenuId, PieSliceId, Profile, ProfileId};
use std::collections::{HashMap, HashSet};
use thiserror::Error;

const MIN_SLICES_PER_MENU: usize = 2;
const MAX_SLICES_PER_MENU: usize = 12;
const MAX_MENU_DEPTH: usize = 3;

#[derive(Debug, Error, PartialEq, Eq, Clone)]
pub enum DomainValidationError {
    #[error("profile {profile} name cannot be empty")]
    EmptyProfileName { profile: ProfileId },
    #[error("profile {profile} root menu {menu} not found")]
    MissingRootMenu { profile: ProfileId, menu: PieMenuId },
    #[error("pie menu {menu} slice {slice} label cannot be empty")]
    EmptySliceLabel { menu: PieMenuId, slice: PieSliceId },
    #[error("pie menu {menu} slice {slice} references missing action {action}")]
    MissingAction {
        menu: PieMenuId,
        slice: PieSliceId,
        action: ActionId,
    },
    #[error("pie menu {menu} slice {slice} references missing child menu {child}")]
    MissingChildMenu {
        menu: PieMenuId,
        slice: PieSliceId,
        child: PieMenuId,
    },
    #[error("pie menu {menu} contains duplicate slice order {order}")]
    DuplicateSliceOrder { menu: PieMenuId, order: u32 },
    #[error("pie menu {menu} has {count} slices which exceeds maximum {max}")]
    TooManySlices { menu: PieMenuId, count: usize, max: usize },
    #[error("pie menu {menu} has {count} slices which is below minimum {min}")]
    TooFewSlices { menu: PieMenuId, count: usize, min: usize },
    #[error("pie menu {menu} depth {depth} exceeds maximum {max}")]
    MenuDepthExceeded { menu: PieMenuId, depth: usize, max: usize },
}

pub fn validate_profile(
    profile: &Profile,
    menus: &[PieMenu],
    actions: &[Action],
) -> Result<(), Vec<DomainValidationError>> {
    let mut errors: Vec<DomainValidationError> = Vec::new();
    if profile.name.trim().is_empty() {
        errors.push(DomainValidationError::EmptyProfileName {
            profile: profile.id,
        });
    }

    let menu_map: HashMap<PieMenuId, &PieMenu> = menus.iter().map(|menu| (menu.id, menu)).collect();
    let action_map: HashMap<ActionId, &Action> =
        actions.iter().map(|action| (action.id, action)).collect();

    if !menu_map.contains_key(&profile.root_menu) {
        errors.push(DomainValidationError::MissingRootMenu {
            profile: profile.id,
            menu: profile.root_menu,
        });
    }

    for menu in menus {
        validate_menu(menu, &menu_map, &action_map, &mut errors);
    }

    if menu_map.contains_key(&profile.root_menu) {
        enforce_depth_limits(profile.root_menu, &menu_map, &mut errors);
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors)
    }
}

fn validate_menu(
    menu: &PieMenu,
    menu_map: &HashMap<PieMenuId, &PieMenu>,
    action_map: &HashMap<ActionId, &Action>,
    errors: &mut Vec<DomainValidationError>,
) {
    let mut seen_orders: HashSet<u32> = HashSet::new();
    for slice in &menu.slices {
        if slice.label.trim().is_empty() {
            errors.push(DomainValidationError::EmptySliceLabel {
                menu: menu.id,
                slice: slice.id,
            });
        }

        if let Some(action_id) = slice.action {
            if !action_map.contains_key(&action_id) {
                errors.push(DomainValidationError::MissingAction {
                    menu: menu.id,
                    slice: slice.id,
                    action: action_id,
                });
            }
        }

        if let Some(child_id) = slice.child_menu {
            if !menu_map.contains_key(&child_id) {
                errors.push(DomainValidationError::MissingChildMenu {
                    menu: menu.id,
                    slice: slice.id,
                    child: child_id,
                });
            }
        }

        if !seen_orders.insert(slice.order) {
            errors.push(DomainValidationError::DuplicateSliceOrder {
                menu: menu.id,
                order: slice.order,
            });
        }
    }

    let slice_count = menu.slices.len();
    if slice_count > MAX_SLICES_PER_MENU {
        errors.push(DomainValidationError::TooManySlices {
            menu: menu.id,
            count: slice_count,
            max: MAX_SLICES_PER_MENU,
        });
    }
    if slice_count < MIN_SLICES_PER_MENU {
        errors.push(DomainValidationError::TooFewSlices {
            menu: menu.id,
            count: slice_count,
            min: MIN_SLICES_PER_MENU,
        });
    }
}

fn enforce_depth_limits(
    root: PieMenuId,
    menu_map: &HashMap<PieMenuId, &PieMenu>,
    errors: &mut Vec<DomainValidationError>,
) {
    let mut visited: HashSet<PieMenuId> = HashSet::new();
    traverse_depth(root, 1, menu_map, errors, &mut visited);
}

fn traverse_depth(
    menu_id: PieMenuId,
    depth: usize,
    menu_map: &HashMap<PieMenuId, &PieMenu>,
    errors: &mut Vec<DomainValidationError>,
    visited: &mut HashSet<PieMenuId>,
) {
    if depth > MAX_MENU_DEPTH {
        errors.push(DomainValidationError::MenuDepthExceeded {
            menu: menu_id,
            depth,
            max: MAX_MENU_DEPTH,
        });
    }

    if !visited.insert(menu_id) {
        return;
    }

    if let Some(menu) = menu_map.get(&menu_id) {
        for slice in &menu.slices {
            if let Some(child) = slice.child_menu {
                traverse_depth(child, depth + 1, menu_map, errors, visited);
            }
        }
    }

    visited.remove(&menu_id);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::pie_menu::{PieAppearance, PieSlice};
    use crate::domain::ActionPayload;

    fn sample_action() -> Action {
        Action::new(
            "Launch",
            ActionPayload::LaunchProgram {
                executable: "notepad".to_string(),
                arguments: vec![],
                working_dir: None,
            },
        )
    }

    fn sample_menu(action_id: ActionId) -> PieMenu {
        PieMenu {
            id: PieMenuId::new(),
            title: "Main".to_string(),
            appearance: PieAppearance::default(),
            slices: vec![PieSlice {
                id: PieSliceId::new(),
                label: "Open".to_string(),
                icon: None,
                hotkey: None,
                action: Some(action_id),
                child_menu: None,
                order: 0,
            }],
        }
    }

    #[test]
    fn validate_profile_ok() {
        let action = sample_action();
        let menu = sample_menu(action.id);
        let profile = Profile {
            id: ProfileId::new(),
            name: "Default".to_string(),
            description: None,
            enabled: true,
            global_hotkey: None,
            activation_rules: vec![],
            root_menu: menu.id,
        };

        let result = validate_profile(&profile, &[menu.clone()], &[action.clone()]);
        assert!(result.is_ok(), "expected validation ok, got {result:?}");
    }

    #[test]
    fn validate_profile_missing_action() {
        let action = sample_action();
        let menu = sample_menu(action.id);
        let profile = Profile {
            id: ProfileId::new(),
            name: "Default".to_string(),
            description: None,
            enabled: true,
            global_hotkey: None,
            activation_rules: vec![],
            root_menu: menu.id,
        };

        let broken_slice = PieSlice {
            id: PieSliceId::new(),
            label: "Broken".to_string(),
            icon: None,
            hotkey: None,
            action: Some(ActionId::new()),
            child_menu: None,
            order: 1,
        };

        let broken_menu = PieMenu {
            slices: vec![broken_slice.clone()],
            ..menu
        };

        let result = validate_profile(&profile, &[broken_menu], &[action]);
        assert!(result.is_err());
        let errs = result.err().unwrap();
        assert!(errs.iter().any(|err| matches!(
            err,
            DomainValidationError::MissingAction { slice, .. } if *slice == broken_slice.id
        )));
    }

    #[test]
    fn validate_profile_enforces_slice_upper_bound() {
        let action = sample_action();
        let mut menu = sample_menu(action.id);
        menu.slices = (0..13)
            .map(|index| PieSlice {
                id: PieSliceId::new(),
                label: format!("Slice {index}"),
                icon: None,
                hotkey: None,
                action: Some(action.id),
                child_menu: None,
                order: index as u32,
            })
            .collect();

        let profile = Profile {
            id: ProfileId::new(),
            name: "Default".to_string(),
            description: None,
            enabled: true,
            global_hotkey: None,
            activation_rules: vec![],
            root_menu: menu.id,
        };

        let result = validate_profile(&profile, &[menu.clone()], &[action.clone()]);
        assert!(result.is_err());
        let errs = result.err().unwrap();
        assert!(errs.iter().any(|err| matches!(
            err,
            DomainValidationError::TooManySlices { menu: offending, .. } if *offending == menu.id
        )));
    }

    #[test]
    fn validate_profile_enforces_slice_lower_bound() {
        let action = sample_action();
        let mut menu = sample_menu(action.id);
        menu.slices = vec![PieSlice {
            id: PieSliceId::new(),
            label: "Solo".to_string(),
            icon: None,
            hotkey: None,
            action: Some(action.id),
            child_menu: None,
            order: 0,
        }];

        let profile = Profile {
            id: ProfileId::new(),
            name: "Default".to_string(),
            description: None,
            enabled: true,
            global_hotkey: None,
            activation_rules: vec![],
            root_menu: menu.id,
        };

        let result = validate_profile(&profile, &[menu.clone()], &[action.clone()]);
        assert!(result.is_err());
        let errs = result.err().unwrap();
        assert!(errs.iter().any(|err| matches!(
            err,
            DomainValidationError::TooFewSlices { menu: offending, .. } if *offending == menu.id
        )));
    }

    #[test]
    fn validate_profile_enforces_max_depth() {
        let action = sample_action();
        let mut root = sample_menu(action.id);
        let mut level_two = PieMenu {
            id: PieMenuId::new(),
            title: "Second".to_string(),
            appearance: PieAppearance::default(),
            slices: Vec::new(),
        };
        let mut level_three = PieMenu {
            id: PieMenuId::new(),
            title: "Third".to_string(),
            appearance: PieAppearance::default(),
            slices: Vec::new(),
        };
        let level_four = PieMenu {
            id: PieMenuId::new(),
            title: "Fourth".to_string(),
            appearance: PieAppearance::default(),
            slices: Vec::new(),
        };

        level_three.slices.push(PieSlice {
            id: PieSliceId::new(),
            label: "Deep".to_string(),
            icon: None,
            hotkey: None,
            action: Some(action.id),
            child_menu: Some(level_four.id),
            order: 0,
        });

        level_two.slices.push(PieSlice {
            id: PieSliceId::new(),
            label: "Middle".to_string(),
            icon: None,
            hotkey: None,
            action: Some(action.id),
            child_menu: Some(level_three.id),
            order: 0,
        });

        root.slices.push(PieSlice {
            id: PieSliceId::new(),
            label: "Next".to_string(),
            icon: None,
            hotkey: None,
            action: Some(action.id),
            child_menu: Some(level_two.id),
            order: 1,
        });

        let menus = vec![root.clone(), level_two.clone(), level_three.clone(), level_four.clone()];
        let profile = Profile {
            id: ProfileId::new(),
            name: "Default".to_string(),
            description: None,
            enabled: true,
            global_hotkey: None,
            activation_rules: vec![],
            root_menu: root.id,
        };

        let result = validate_profile(&profile, &menus, &[action]);
        assert!(result.is_err());
        let errs = result.err().unwrap();
        assert!(errs.iter().any(|err| matches!(
            err,
            DomainValidationError::MenuDepthExceeded { menu: offending, .. } if *offending == level_three.id
                || *offending == level_four.id
        )));
    }
}
