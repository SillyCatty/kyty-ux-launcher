//! Minimal reader/patcher for Qt `QSettings::IniFormat` files.
//!
//! The document is kept as raw lines so that saving only touches the keys that
//! were explicitly set; everything else (window geometry, per-game configs,
//! unknown keys) is written back byte-for-byte.

use std::{fs, io, path::Path};

pub struct IniDoc {
    lines: Vec<String>,
    newline: &'static str,
}

#[derive(Debug, PartialEq)]
pub enum QtValue {
    Invalid,
    Str(String),
    List(Vec<String>),
}

impl IniDoc {
    pub fn load(path: &Path) -> io::Result<Self> {
        match fs::read(path) {
            Ok(bytes) => Ok(Self::parse(&String::from_utf8_lossy(&bytes))),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(Self::parse("")),
            Err(e) => Err(e),
        }
    }

    pub fn parse(text: &str) -> Self {
        let text = text.strip_prefix('\u{feff}').unwrap_or(text);
        let newline = if text.contains("\r\n") || (text.is_empty() && cfg!(windows)) {
            "\r\n"
        } else {
            "\n"
        };
        Self { lines: text.lines().map(str::to_owned).collect(), newline }
    }

    fn section_name(line: &str) -> Option<&str> {
        let t = line.trim();
        (t.len() >= 2 && t.starts_with('[') && t.ends_with(']')).then(|| &t[1..t.len() - 1])
    }

    fn key_value(line: &str) -> Option<(&str, &str)> {
        let t = line.trim_start();
        if t.starts_with(';') || t.starts_with('#') || Self::section_name(line).is_some() {
            return None;
        }
        let (k, v) = line.split_once('=')?;
        Some((k.trim(), v.trim()))
    }

    fn section_range(&self, section: &str) -> Option<(usize, usize)> {
        let start = self.lines.iter().position(|l| Self::section_name(l) == Some(section))?;
        let end = self.lines[start + 1..]
            .iter()
            .position(|l| Self::section_name(l).is_some())
            .map_or(self.lines.len(), |p| start + 1 + p);
        Some((start, end))
    }

    pub fn entries(&self, section: &str) -> Vec<(String, String)> {
        let Some((start, end)) = self.section_range(section) else { return Vec::new() };
        self.lines[start + 1..end]
            .iter()
            .filter_map(|l| Self::key_value(l))
            .map(|(k, v)| (k.to_owned(), v.to_owned()))
            .collect()
    }

    pub fn get(&self, section: &str, key: &str) -> Option<String> {
        let (start, end) = self.section_range(section)?;
        self.lines[start + 1..end]
            .iter()
            .filter_map(|l| Self::key_value(l))
            .find(|(k, _)| *k == key)
            .map(|(_, v)| v.to_owned())
    }

    pub fn set(&mut self, section: &str, key: &str, raw_value: &str) {
        let line = format!("{key}={raw_value}");
        match self.section_range(section) {
            Some((start, end)) => {
                for i in start + 1..end {
                    if Self::key_value(&self.lines[i]).is_some_and(|(k, _)| k == key) {
                        self.lines[i] = line;
                        return;
                    }
                }
                let mut at = end;
                while at > start + 1 && self.lines[at - 1].trim().is_empty() {
                    at -= 1;
                }
                self.lines.insert(at, line);
            }
            None => {
                if self.lines.last().is_some_and(|l| !l.trim().is_empty()) {
                    self.lines.push(String::new());
                }
                self.lines.push(format!("[{section}]"));
                self.lines.push(line);
            }
        }
    }

    pub fn serialize(&self) -> String {
        let mut out = self.lines.join(self.newline);
        out.push_str(self.newline);
        out
    }

    /// Writes via a temp file + rename so a crash mid-write can't truncate the config.
    pub fn save(&self, path: &Path) -> io::Result<()> {
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir)?;
        }
        let tmp = path.with_extension("ini.launcher-tmp");
        fs::write(&tmp, self.serialize())?;
        fs::rename(&tmp, path)
    }
}

pub fn decode(raw: &str) -> QtValue {
    let raw = raw.trim();
    if raw == "@Invalid()" {
        return QtValue::Invalid;
    }

    let mut items = Vec::new();
    let mut cur = String::new();
    let mut in_quotes = false;
    let mut chars = raw.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '"' => in_quotes = !in_quotes,
            '\\' => match chars.next() {
                Some('n') => cur.push('\n'),
                Some('r') => cur.push('\r'),
                Some('t') => cur.push('\t'),
                Some('a') => cur.push('\x07'),
                Some('b') => cur.push('\x08'),
                Some('f') => cur.push('\x0c'),
                Some('v') => cur.push('\x0b'),
                Some('0') => cur.push('\0'),
                Some('x') => {
                    let mut hex = String::new();
                    while let Some(&h) = chars.peek() {
                        if !h.is_ascii_hexdigit() || hex.len() == 4 {
                            break;
                        }
                        hex.push(h);
                        chars.next();
                    }
                    if let Some(ch) = u32::from_str_radix(&hex, 16).ok().and_then(char::from_u32) {
                        cur.push(ch);
                    }
                }
                Some(other) => cur.push(other),
                None => {}
            },
            ',' if !in_quotes => {
                items.push(unescape_at(std::mem::take(&mut cur)));
                while chars.peek() == Some(&' ') {
                    chars.next();
                }
            }
            _ => cur.push(c),
        }
    }
    items.push(unescape_at(cur));

    if items.len() > 1 {
        QtValue::List(items)
    } else {
        QtValue::Str(items.pop().unwrap_or_default())
    }
}

fn unescape_at(s: String) -> String {
    match s.strip_prefix("@@") {
        Some(rest) => format!("@{rest}"),
        None => s,
    }
}

pub fn decode_string(raw: &str) -> String {
    match decode(raw) {
        QtValue::Invalid => String::new(),
        QtValue::Str(s) => s,
        QtValue::List(l) => l.join(", "),
    }
}

pub fn decode_list(raw: &str) -> Vec<String> {
    match decode(raw) {
        QtValue::Invalid => Vec::new(),
        QtValue::Str(s) if s.is_empty() => Vec::new(),
        QtValue::Str(s) => vec![s],
        QtValue::List(l) => l,
    }
}

/// Mirrors `QSettingsPrivate::iniEscapedString`.
pub fn encode_str(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut needs_quotes = false;
    let mut escape_next_hex = false;
    if s.starts_with('@') {
        out.push('@');
    }
    for c in s.chars() {
        if matches!(c, ';' | ',' | '=') {
            needs_quotes = true;
        }
        if escape_next_hex && c.is_ascii_hexdigit() {
            out.push_str(&format!("\\x{:x}", c as u32));
            continue;
        }
        escape_next_hex = false;
        match c {
            '\0' => {
                out.push_str("\\0");
                escape_next_hex = true;
            }
            '\x07' => out.push_str("\\a"),
            '\x08' => out.push_str("\\b"),
            '\x0c' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\x0b' => out.push_str("\\v"),
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            c if (c as u32) <= 0x1f || c as u32 == 0x7f => {
                out.push_str(&format!("\\x{:x}", c as u32));
                escape_next_hex = true;
            }
            c => out.push(c),
        }
    }
    if needs_quotes || out.starts_with(' ') || out.ends_with(' ') {
        format!("\"{out}\"")
    } else {
        out
    }
}

pub fn encode_list(items: &[String]) -> String {
    if items.is_empty() {
        return "@Invalid()".into();
    }
    items.iter().map(|s| encode_str(s)).collect::<Vec<_>>().join(", ")
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "[MainDialog]\r\ngeometry=@ByteArray(\\x1\\xd9)\r\n\r\n[Launcher]\r\ngame_dirs=C:/Users/You/Downloads/ps5 games\r\n\r\n[GlobalConfiguration]\r\nuser_name=Kyty\r\nhost_input_mapping=@Invalid()\r\n\r\n[GameConfigurations]\r\nsize=0\r\n";

    #[test]
    fn untouched_round_trip_is_identical() {
        assert_eq!(IniDoc::parse(SAMPLE).serialize(), SAMPLE);
    }

    #[test]
    fn set_replaces_in_place_and_preserves_rest() {
        let mut doc = IniDoc::parse(SAMPLE);
        doc.set("GlobalConfiguration", "user_name", "You");
        doc.set("GlobalConfiguration", "user_id", "7");
        let out = doc.serialize();
        assert!(out.contains("user_name=You\r\nhost_input_mapping=@Invalid()\r\nuser_id=7\r\n\r\n[GameConfigurations]"));
        assert!(out.contains("geometry=@ByteArray(\\x1\\xd9)"));
    }

    #[test]
    fn set_creates_missing_section() {
        let mut doc = IniDoc::parse("");
        doc.set("GlobalConfiguration", "fullscreen_enabled", "true");
        assert_eq!(doc.get("GlobalConfiguration", "fullscreen_enabled").as_deref(), Some("true"));
    }

    #[test]
    fn qt_string_codec() {
        for s in ["plain", "with space", " lead", "a,b", "quote\"d", "back\\slash", "@at", "Grüße", ""] {
            assert_eq!(decode_string(&encode_str(s)), s, "round trip of {s:?}");
        }
        assert_eq!(encode_str("a,b"), "\"a,b\"");
        assert_eq!(encode_str("C:/x y"), "C:/x y");
    }

    #[test]
    fn qt_list_codec() {
        let dirs = vec!["C:/a b".to_string(), "D:/games, old".to_string()];
        assert_eq!(decode_list(&encode_list(&dirs)), dirs);
        assert_eq!(decode_list("@Invalid()"), Vec::<String>::new());
        assert_eq!(decode_list("C:/one"), vec!["C:/one".to_string()]);
    }
}
