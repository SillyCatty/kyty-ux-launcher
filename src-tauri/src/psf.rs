//! Reader for PS4 `param.sfo` files (the "PSF" key/value container).

use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq)]
pub enum PsfValue {
    Text(String),
    Int(u32),
}

fn u16_at(b: &[u8], o: usize) -> Option<u16> {
    b.get(o..o + 2).map(|s| u16::from_le_bytes([s[0], s[1]]))
}

fn u32_at(b: &[u8], o: usize) -> Option<u32> {
    b.get(o..o + 4).map(|s| u32::from_le_bytes([s[0], s[1], s[2], s[3]]))
}

/// Returns `None` for anything that isn't a well-formed PSF; every offset is bounds-checked.
pub fn parse(bytes: &[u8]) -> Option<BTreeMap<String, PsfValue>> {
    if u32_at(bytes, 0)? != 0x4653_5000 {
        return None;
    }
    let key_table = u32_at(bytes, 8)? as usize;
    let data_table = u32_at(bytes, 12)? as usize;
    let count = u32_at(bytes, 16)? as usize;
    if count == 0 || count > 4096 || key_table >= bytes.len() || data_table >= bytes.len() {
        return None;
    }

    let mut map = BTreeMap::new();
    for i in 0..count {
        let entry = 20 + i * 16;
        let key_offset = u16_at(bytes, entry)? as usize;
        let format = u16_at(bytes, entry + 2)?;
        let len = u32_at(bytes, entry + 4)? as usize;
        let data_offset = u32_at(bytes, entry + 12)? as usize;

        let key_bytes = bytes.get(key_table + key_offset..)?;
        let key_end = key_bytes.iter().position(|&c| c == 0)?;
        let key = String::from_utf8_lossy(&key_bytes[..key_end]).into_owned();

        let start = data_table.checked_add(data_offset)?;
        match format {
            0x0004 | 0x0204 => {
                let raw = bytes.get(start..start.checked_add(len)?)?;
                let end = raw.iter().position(|&c| c == 0).unwrap_or(raw.len());
                map.insert(key, PsfValue::Text(String::from_utf8_lossy(&raw[..end]).into_owned()));
            }
            0x0404 => {
                map.insert(key, PsfValue::Int(u32_at(bytes, start)?));
            }
            _ => {}
        }
    }
    Some(map)
}

pub fn text(map: &BTreeMap<String, PsfValue>, key: &str) -> Option<String> {
    match map.get(key) {
        Some(PsfValue::Text(s)) if !s.trim().is_empty() => Some(s.trim().to_owned()),
        _ => None,
    }
}

/// `SYSTEM_VER` such as `0x05050000` means firmware 5.05.
pub fn firmware(map: &BTreeMap<String, PsfValue>) -> Option<String> {
    match map.get("SYSTEM_VER") {
        Some(PsfValue::Int(v)) if *v != 0 => Some(format!("{:x}.{:02x}", v >> 24, (v >> 16) & 0xff)),
        _ => None,
    }
}

#[cfg(test)]
pub fn build_for_test(entries: &[(&str, PsfValue)]) -> Vec<u8> {
    let mut keys = Vec::new();
    let mut data = Vec::new();
    let mut table = Vec::new();
    for (key, value) in entries {
        let key_offset = keys.len() as u16;
        keys.extend_from_slice(key.as_bytes());
        keys.push(0);
        let data_offset = data.len() as u32;
        let (format, len, max) = match value {
            PsfValue::Text(s) => {
                data.extend_from_slice(s.as_bytes());
                data.push(0);
                (0x0204u16, s.len() as u32 + 1, 64u32)
            }
            PsfValue::Int(v) => {
                data.extend_from_slice(&v.to_le_bytes());
                (0x0404u16, 4u32, 4u32)
            }
        };
        table.extend_from_slice(&key_offset.to_le_bytes());
        table.extend_from_slice(&format.to_le_bytes());
        table.extend_from_slice(&len.to_le_bytes());
        table.extend_from_slice(&max.to_le_bytes());
        table.extend_from_slice(&data_offset.to_le_bytes());
    }
    let key_table = 20 + table.len();
    let data_table = key_table + keys.len();
    let mut out = Vec::new();
    out.extend_from_slice(&0x4653_5000u32.to_le_bytes());
    out.extend_from_slice(&0x0101u32.to_le_bytes());
    out.extend_from_slice(&(key_table as u32).to_le_bytes());
    out.extend_from_slice(&(data_table as u32).to_le_bytes());
    out.extend_from_slice(&(entries.len() as u32).to_le_bytes());
    out.extend_from_slice(&table);
    out.extend_from_slice(&keys);
    out.extend_from_slice(&data);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_typical_param_sfo() {
        let bytes = build_for_test(&[
            ("APP_VER", PsfValue::Text("01.05".into())),
            ("SYSTEM_VER", PsfValue::Int(0x0505_0000)),
            ("TITLE", PsfValue::Text("My Indie Game".into())),
            ("TITLE_ID", PsfValue::Text("CUSA12345".into())),
        ]);
        let map = parse(&bytes).unwrap();
        assert_eq!(text(&map, "TITLE").as_deref(), Some("My Indie Game"));
        assert_eq!(text(&map, "TITLE_ID").as_deref(), Some("CUSA12345"));
        assert_eq!(text(&map, "APP_VER").as_deref(), Some("01.05"));
        assert_eq!(firmware(&map).as_deref(), Some("5.05"));
        assert_eq!(text(&map, "MISSING"), None);
    }

    #[test]
    fn formats_firmware_versions() {
        let fw = |v: u32| firmware(&parse(&build_for_test(&[("SYSTEM_VER", PsfValue::Int(v))])).unwrap());
        assert_eq!(fw(0x0900_0000).as_deref(), Some("9.00"));
        assert_eq!(fw(0x1100_0000).as_deref(), Some("11.00"));
        assert_eq!(fw(0).as_deref(), None);
    }

    #[test]
    fn rejects_garbage_and_truncated_files_without_panicking() {
        assert!(parse(b"").is_none());
        assert!(parse(b"not an sfo at all, just text").is_none());
        let good = build_for_test(&[("TITLE", PsfValue::Text("x".into()))]);
        for cut in 0..good.len() {
            let _ = parse(&good[..cut]); // must never panic
        }
        let mut evil = good.clone();
        evil[16..20].copy_from_slice(&u32::MAX.to_le_bytes()); // absurd entry count
        assert!(parse(&evil).is_none());
    }
}
