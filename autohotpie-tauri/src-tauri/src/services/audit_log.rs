use crate::storage::StorageManager;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
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

    pub fn current_log_path(&self) -> io::Result<PathBuf> {
        let guard = self
            .inner
            .lock()
            .map_err(|_| io::Error::new(io::ErrorKind::Other, "audit logger poisoned"))?;
        Ok(guard
            .log_dir
            .join(log_filename(&guard.current_date)))
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
    let file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)?;
    Ok((date_str, file))
}

fn format_date(datetime: OffsetDateTime) -> io::Result<String> {
    datetime
        .format(DATE_FORMAT)
        .map_err(|err| io::Error::new(io::ErrorKind::Other, format!("failed to format date: {err}")))
}

fn format_timestamp(datetime: OffsetDateTime) -> io::Result<String> {
    datetime
        .format(TIMESTAMP_FORMAT)
        .map_err(|err| io::Error::new(io::ErrorKind::Other, format!("failed to format timestamp: {err}")))
}

fn log_filename(date_str: &str) -> String {
    format!("{LOG_FILE_PREFIX}-{date_str}.log")
}
