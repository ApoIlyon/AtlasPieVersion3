pub mod action;
pub mod context_rules;
pub mod pie_menu;
pub mod profile;
pub mod validation;

pub use action::{Action, ActionId, ActionPayload};
pub use context_rules::{ContextMatcher, ContextRule, ContextSnapshot, MatchMode, MatchPattern};
pub use pie_menu::{PieAppearance, PieMenu, PieMenuId, PieSlice, PieSliceId};
pub use profile::{ActivationMatchMode, ActivationRule, Profile, ProfileId};
pub use validation::{validate_profile, DomainValidationError};
