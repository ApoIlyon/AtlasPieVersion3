use crate::domain::ActionEventPayload;
use crate::storage::StorageManager;
use serde::Serialize;
use serde_json::json;
use std::cmp::Ordering;
use std::fs::{self, File, OpenOptions};
use std::io::{self, BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use time::format_description::FormatItem;
use time::macros::format_description;
use time::OffsetDateTime;

const LOG_DIR: &str = "logs";
const LOG_FILE_PREFIX: &str = "AHP-Audit";
const DATE_FORMAT: &[FormatItem<'static>] = format_description!("[year][month][day]");
const TIMESTAMP_FORMAT: &[FormatItem<'static>] =
    format_description!("[year]-[month]-[day]T[hour]:[minute]:[second]Z");

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditLogRecord {
    pub timestamp: String,
    pub level: String,
    pub message: String,
    pub raw: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditLogSnapshot {
    pub entries: Vec<AuditLogRecord>,
    pub file_path: String,
    pub truncated: bool,
}

#[derive(Clone)]
pub struct AuditLogger {
    inner: Arc<Mutex<AuditLoggerInner>>,
}

struct AuditLoggerInner {
    log_dir: PathBuf,
    current_date: String,
    file: File,
}

impl AuditLogger {
    pub fn from_storage(storage: &StorageManager) -> io::Result<Self> {
        let mut log_dir = storage.base_dir().to_path_buf();
        log_dir.push(LOG_DIR);
        if !log_dir.exists() {
            fs::create_dir_all(&log_dir)?;
        }
        let now = OffsetDateTime::now_utc();
        let (date, file) = open_for_date(&log_dir, now)?;
        Ok(Self {
            inner: Arc::new(Mutex::new(AuditLoggerInner {
                log_dir,
                current_date: date,
                file,
            })),
        })
    }

    pub fn log(&self, level: &str, message: &str) -> io::Result<()> {
        let now = OffsetDateTime::now_utc();
        let timestamp = format_timestamp(now)?;
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| io::Error::new(io::ErrorKind::Other, "audit logger poisoned"))?;
        guard.rotate_if_needed(now)?;
        writeln!(guard.file, "[{timestamp}] [{level}] {message}")?;
        guard.file.flush()
    }

    pub fn log_err(&self, level: &str, err: &str) {
        if let Err(e) = self.log(level, err) {
            eprintln!("failed to write audit log: {e}");
        }
    }

    pub fn log_action_outcome(&self, payload: &ActionEventPayload) -> io::Result<()> {
        let entry = json!({
            "component": "action_runner",
            "event": payload,
        });
        let serialized = serde_json::to_string(&entry).map_err(|err| {
            io::Error::new(
                io::ErrorKind::Other,
                format!("failed to serialize action event: {err}"),
            )
        })?;
        self.log("ACTION", &serialized)
    }

    pub fn current_log_path(&self) -> io::Result<PathBuf> {
        let guard = self
            .inner
            .lock()
            .map_err(|_| io::Error::new(io::ErrorKind::Other, "audit logger poisoned"))?;
        Ok(guard.log_dir.join(log_filename(&guard.current_date)))
    }

    pub fn read_recent(&self, limit: usize) -> io::Result<AuditLogSnapshot> {
        if limit == 0 {
            return Ok(AuditLogSnapshot {
                entries: Vec::new(),
                file_path: String::new(),
                truncated: false,
            });
        }

        let guard = self
            .inner
            .lock()
            .map_err(|_| io::Error::new(io::ErrorKind::Other, "audit logger poisoned"))?;
        let log_dir = guard.log_dir.clone();
        let current_file = log_dir.join(log_filename(&guard.current_date));
        drop(guard);

        let mut files = collect_log_files(&log_dir)?;
        if files.is_empty() {
            if !current_file.exists() {
                let _ = File::create(&current_file);
            }
            files.push(current_file.clone());
        }

        let mut collected: Vec<AuditLogRecord> = Vec::new();
        let mut truncated = false;

        for path in files.iter().rev() {
            if collected.len() >= limit {
                truncated = true;
                break;
            }

            let file = match File::open(path) {
                Ok(file) => file,
                Err(err) if err.kind() == io::ErrorKind::NotFound => continue,
                Err(err) => return Err(err),
            };

            let reader = BufReader::new(file);
            let mut lines: Vec<String> = Vec::new();
            for line in reader.lines() {
                match line {
                    Ok(text) => lines.push(text),
                    Err(err) => {
                        eprintln!("failed to read audit log line: {err}");
                        continue;
                    }
                }
            }

            for line in lines.into_iter().rev() {
                let record = parse_log_line(&line);
                collected.push(record);
                if collected.len() >= limit {
                    truncated = true;
                    break;
                }
            }
        }

        collected.reverse();

        Ok(AuditLogSnapshot {
            entries: collected,
            file_path: current_file.to_string_lossy().to_string(),
            truncated,
        })
    }
}

impl AuditLoggerInner {
    fn rotate_if_needed(&mut self, now: OffsetDateTime) -> io::Result<()> {
        let date_str = format_date(now)?;
        if date_str != self.current_date {
            let (_date, file) = open_for_date(&self.log_dir, now)?;
            self.file = file;
            self.current_date = date_str;
        }
        Ok(())
    }
}

fn open_for_date(dir: &Path, datetime: OffsetDateTime) -> io::Result<(String, File)> {
    let date_str = format_date(datetime)?;
    let path = dir.join(log_filename(&date_str));
    let file = OpenOptions::new().create(true).append(true).open(path)?;
    Ok((date_str, file))
}

fn format_date(datetime: OffsetDateTime) -> io::Result<String> {
    datetime.format(DATE_FORMAT).map_err(|err| {
        io::Error::new(
            io::ErrorKind::Other,
            format!("failed to format date: {err}"),
        )
    })
}

fn collect_log_files(dir: &Path) -> io::Result<Vec<PathBuf>> {
    let mut entries: Vec<PathBuf> = fs::read_dir(dir)?
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| match entry.file_type() {
            Ok(file_type) if file_type.is_file() => Some(entry.path()),
            _ => None,
        })
        .collect();

    entries.sort_by(|a, b| match (a.file_name(), b.file_name()) {
        (Some(name_a), Some(name_b)) => match (name_a.to_str(), name_b.to_str()) {
            (Some(str_a), Some(str_b)) => str_a.cmp(str_b),
            (Some(_), None) => Ordering::Greater,
            (None, Some(_)) => Ordering::Less,
            (None, None) => Ordering::Equal,
        },
        (Some(_), None) => Ordering::Greater,
        (None, Some(_)) => Ordering::Less,
        (None, None) => Ordering::Equal,
    });

    Ok(entries)
}

fn parse_log_line(line: &str) -> AuditLogRecord {
    if let Some(stripped) = line.strip_prefix('[') {
        if let Some(timestamp_end) = stripped.find("] [") {
            let timestamp = stripped[..timestamp_end].to_string();
            let rest = &stripped[timestamp_end + 3..];
            if let Some(level_end) = rest.find("] ") {
                let level = rest[..level_end].to_string();
                let message = rest[level_end + 2..].to_string();
                return AuditLogRecord {
                    timestamp,
                    level,
                    message,
                    raw: line.to_string(),
                };
            }
        }
    }

    AuditLogRecord {
        timestamp: String::from("unknown"),
        level: String::from("INFO"),
        message: line.to_string(),
        raw: line.to_string(),
    }
}

fn format_timestamp(datetime: OffsetDateTime) -> io::Result<String> {
    datetime.format(TIMESTAMP_FORMAT).map_err(|err| {
        io::Error::new(
            io::ErrorKind::Other,
            format!("failed to format timestamp: {err}"),
        )
    })
}

fn log_filename(date_str: &str) -> String {
    format!("{LOG_FILE_PREFIX}-{date_str}.log")
}
