use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
};

use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use once_cell::sync::Lazy;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use serde_json;
use tauri::{AppHandle, Emitter, Manager, Runtime};

const LOCALIZATION_UPDATED_EVENT: &str = "localization://updated";
const DEFAULT_LANGUAGE: &str = "en";
const CURRENT_SCHEMA_VERSION: u32 = 2;

static BUILTIN_PACKS: Lazy<Vec<LocalizationPack>> = Lazy::new(|| {
    vec![
        parse_builtin_pack(
            include_str!("../../resources/localization/en.json"),
            Some("en"),
        )
        .expect("failed to parse builtin en localization pack"),
        parse_builtin_pack(
            include_str!("../../resources/localization/ru.json"),
            Some("ru"),
        )
        .expect("failed to parse builtin ru localization pack"),
    ]
});

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalizationPack {
    #[serde(default)]
    pub schema_version: u32,
    pub language: String,
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub strings: HashMap<String, String>,
    #[serde(default)]
    pub missing_keys: Vec<String>,
    #[serde(default)]
    pub fallback_of: Option<String>,
}

struct LocalizationState {
    cache: HashMap<String, LocalizationPack>,
    watcher: Option<RecommendedWatcher>,
    directory: Option<PathBuf>,
}

impl Default for LocalizationState {
    fn default() -> Self {
        Self {
            cache: HashMap::new(),
            watcher: None,
            directory: None,
        }
    }
}

static LOCALIZATION_STATE: Lazy<RwLock<LocalizationState>> =
    Lazy::new(|| RwLock::new(LocalizationState::default()));

pub fn init<R: Runtime>(app: &AppHandle<R>) -> anyhow::Result<()> {
    let dir = ensure_localization_dir(app)?;
    reload_all(&dir)?;
    start_watcher(app, &dir)?;
    LOCALIZATION_STATE.write().directory = Some(dir);
    Ok(())
}

fn ensure_localization_dir<R: Runtime>(app: &AppHandle<R>) -> anyhow::Result<PathBuf> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|err| anyhow::anyhow!("failed to resolve config dir: {err}"))?
        .join("autohotpie")
        .join("localization");

    if !dir.exists() {
        fs::create_dir_all(&dir)?;
    }

    Ok(dir)
}

fn reload_all(dir: &Path) -> anyhow::Result<()> {
    if !dir.exists() {
        fs::create_dir_all(dir)?;
    }

    let mut cache: HashMap<String, LocalizationPack> = BUILTIN_PACKS
        .iter()
        .map(|pack| (pack.language.clone(), pack.clone()))
        .collect();

    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        if !entry.file_type()?.is_file() {
            continue;
        }
        if entry.path().extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }

        match load_pack(entry.path()) {
            Ok(pack) => {
                cache.insert(pack.language.clone(), pack);
            }
            Err(err) => {
                eprintln!("failed to load localization pack {:?}: {err}", entry.path());
            }
        }
    }

    ensure_builtin_languages(&mut cache);
    recompute_missing_keys(&mut cache);

    LOCALIZATION_STATE.write().cache = cache;
    Ok(())
}

fn load_pack<P: AsRef<Path>>(path: P) -> anyhow::Result<LocalizationPack> {
    let path = path.as_ref();
    let data = fs::read_to_string(path)?;
    let mut pack: LocalizationPack = serde_json::from_str(&data)?;
    if pack.language.is_empty() {
        pack.language = path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or(DEFAULT_LANGUAGE)
            .to_string();
    }
    Ok(apply_migrations(pack))
}

fn recompute_missing_keys(cache: &mut HashMap<String, LocalizationPack>) {
    let snapshot: HashMap<String, HashSet<String>> = cache
        .iter()
        .map(|(code, pack)| {
            (
                code.clone(),
                pack.strings.keys().cloned().collect::<HashSet<String>>(),
            )
        })
        .collect();

    for pack in cache.values_mut() {
        let fallback_lang = pack
            .fallback_of
            .clone()
            .filter(|code| snapshot.contains_key(code))
            .unwrap_or_else(|| DEFAULT_LANGUAGE.to_string());

        if pack.language == fallback_lang {
            pack.missing_keys.clear();
            continue;
        }

        let baseline_keys = snapshot.get(&fallback_lang).cloned().unwrap_or_default();
        let pack_keys: HashSet<String> = pack.strings.keys().cloned().collect();

        let mut missing: Vec<String> = baseline_keys.difference(&pack_keys).cloned().collect();
        missing.sort();
        pack.missing_keys = missing;
    }
}

pub fn get_pack(language: &str) -> Option<LocalizationPack> {
    let state = LOCALIZATION_STATE.read();
    finalize_pack(language, &state.cache)
}

pub fn available_languages() -> Vec<String> {
    let mut languages = LOCALIZATION_STATE
        .read()
        .cache
        .keys()
        .cloned()
        .collect::<Vec<_>>();
    languages.sort();
    languages
}

pub fn refresh() -> anyhow::Result<()> {
    let dir = {
        LOCALIZATION_STATE
            .read()
            .directory
            .clone()
            .ok_or_else(|| anyhow::anyhow!("localization directory not initialized"))?
    };
    reload_all(&dir)
}

fn start_watcher<R: Runtime>(app: &AppHandle<R>, dir: &Path) -> anyhow::Result<()> {
    let handle = app.clone();
    let mut watcher = notify::recommended_watcher(move |res| match res {
        Ok(event) => {
            handle_event(&handle, event);
        }
        Err(err) => {
            eprintln!("localization watcher error: {err}");
        }
    })?;

    watcher.watch(dir, RecursiveMode::NonRecursive)?;

    LOCALIZATION_STATE.write().watcher = Some(watcher);
    Ok(())
}

fn handle_event<R: Runtime>(app: &AppHandle<R>, event: notify::Event) {
    let mut cache_changed = false;
    {
        let mut state = LOCALIZATION_STATE.write();
        match event.kind {
            EventKind::Create(_) | EventKind::Modify(_) => {
                for path in &event.paths {
                    if !is_localization_file(path) {
                        continue;
                    }
                    match load_pack(path) {
                        Ok(pack) => {
                            state.cache.insert(pack.language.clone(), pack);
                            cache_changed = true;
                        }
                        Err(err) => {
                            eprintln!("failed to reload localization pack {:?}: {err}", path);
                        }
                    }
                }
            }
            EventKind::Remove(_) => {
                for path in &event.paths {
                    if let Some(code) = language_code_from_path(path) {
                        if state.cache.remove(&code).is_some() {
                            cache_changed = true;
                        }
                    }
                }
            }
            _ => {}
        }

        if cache_changed {
            ensure_builtin_languages(&mut state.cache);
            recompute_missing_keys(&mut state.cache);
        }
    }

    if cache_changed {
        if let Err(err) = app.emit(LOCALIZATION_UPDATED_EVENT, ()) {
            eprintln!("failed to emit localization update event: {err}");
        }
    }
}

fn is_localization_file(path: &Path) -> bool {
    path.extension().and_then(|ext| ext.to_str()) == Some("json")
}

fn language_code_from_path(path: &Path) -> Option<String> {
    path.file_stem()
        .and_then(|value| value.to_str())
        .map(|value| value.to_string())
}

fn parse_builtin_pack(
    data: &str,
    fallback_language: Option<&str>,
) -> anyhow::Result<LocalizationPack> {
    let mut pack: LocalizationPack = serde_json::from_str(data)?;
    if pack.language.is_empty() {
        if let Some(code) = fallback_language {
            pack.language = code.to_string();
        }
    }
    Ok(apply_migrations(pack))
}

fn ensure_builtin_languages(cache: &mut HashMap<String, LocalizationPack>) {
    for pack in BUILTIN_PACKS.iter() {
        cache
            .entry(pack.language.clone())
            .or_insert_with(|| pack.clone());
    }
}

fn apply_migrations(mut pack: LocalizationPack) -> LocalizationPack {
    if pack.schema_version == 0 {
        pack.schema_version = 1;
    }

    if pack.version.is_empty() {
        pack.version = "0.0.0".into();
    }

    if pack.schema_version < CURRENT_SCHEMA_VERSION {
        if pack.schema_version < 2 {
            if pack.language != DEFAULT_LANGUAGE && pack.fallback_of.is_none() {
                pack.fallback_of = Some(DEFAULT_LANGUAGE.to_string());
            }
            pack.schema_version = 2;
        }
    }

    let mut missing = pack.missing_keys;
    missing.sort();
    missing.dedup();
    pack.missing_keys = missing;

    pack
}

fn finalize_pack(
    language: &str,
    cache: &HashMap<String, LocalizationPack>,
) -> Option<LocalizationPack> {
    fn resolve_chain(
        code: &str,
        cache: &HashMap<String, LocalizationPack>,
        visited: &mut HashSet<String>,
    ) -> Option<LocalizationPack> {
        if !visited.insert(code.to_string()) {
            return None;
        }

        let mut pack = cache.get(code).cloned()?;
        if pack.fallback_of.as_deref() == Some(code) {
            pack.fallback_of = None;
        }

        if let Some(fallback_code) = pack.fallback_of.clone() {
            if let Some(fallback) = resolve_chain(&fallback_code, cache, visited) {
                let mut merged = fallback.strings.clone();
                merged.extend(pack.strings.clone());
                pack.strings = merged;
            }
        }

        Some(pack)
    }

    if cache.contains_key(language) {
        let mut visited = HashSet::new();
        if let Some(pack) = resolve_chain(language, cache, &mut visited) {
            return Some(pack);
        }
    }

    if language != DEFAULT_LANGUAGE && cache.contains_key(DEFAULT_LANGUAGE) {
        let mut visited = HashSet::new();
        if let Some(pack) = resolve_chain(DEFAULT_LANGUAGE, cache, &mut visited) {
            return Some(pack);
        }
    }

    BUILTIN_PACKS
        .iter()
        .find(|pack| pack.language == DEFAULT_LANGUAGE)
        .cloned()
}

pub fn shutdown() {
    if let Some(mut watcher) = LOCALIZATION_STATE.write().watcher.take() {
        if let Err(err) = watcher.unwatch(
            LOCALIZATION_STATE
                .read()
                .directory
                .as_ref()
                .map(|path| path.as_path())
                .unwrap_or(Path::new("")),
        ) {
            eprintln!("failed to stop localization watcher: {err}");
        }
    }
}
