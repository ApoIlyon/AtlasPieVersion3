use super::{Action, ActionId, PieMenu, PieMenuId, PieSlice, PieSliceId, Profile, ProfileId};
use std::collections::{HashMap, HashSet};
use thiserror::Error;

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

    let menu_map: HashMap<PieMenuId, &PieMenu> =
        menus.iter().map(|menu| (menu.id, menu)).collect();
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
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
