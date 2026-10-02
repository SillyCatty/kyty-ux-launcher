use std::collections::HashSet;

use ash::vk;
use cpal::traits::{DeviceTrait, HostTrait};
use serde::Serialize;

#[derive(Serialize, Default)]
pub struct Devices {
    pub gpus: Vec<String>,
    pub microphones: Vec<String>,
    pub cpu: String,
    pub amd_cpu: bool,
}

pub fn list() -> Devices {
    let cpu = std::env::var("PROCESSOR_IDENTIFIER").unwrap_or_default();
    Devices { gpus: gpus(), microphones: microphones(), amd_cpu: cpu.contains("AuthenticAMD"), cpu }
}

/// Same order as `vkEnumeratePhysicalDevices`, which is what the emulator's `--gpu <index>` uses.
fn gpus() -> Vec<String> {
    let Ok(entry) = (unsafe { ash::Entry::load() }) else { return Vec::new() };
    for version in [vk::make_api_version(0, 1, 3, 0), vk::make_api_version(0, 1, 0, 0)] {
        let app = vk::ApplicationInfo::default().api_version(version);
        let info = vk::InstanceCreateInfo::default().application_info(&app);
        let Ok(instance) = (unsafe { entry.create_instance(&info, None) }) else { continue };
        let names = unsafe { instance.enumerate_physical_devices() }
            .unwrap_or_default()
            .into_iter()
            .map(|device| {
                let props = unsafe { instance.get_physical_device_properties(device) };
                props
                    .device_name_as_c_str()
                    .map(|name| name.to_string_lossy().into_owned())
                    .unwrap_or_else(|_| "Unknown GPU".into())
            })
            .collect();
        unsafe { instance.destroy_instance(None) };
        return names;
    }
    Vec::new()
}

fn microphones() -> Vec<String> {
    let mut seen = HashSet::new();
    cpal::default_host()
        .input_devices()
        .map(|devices| devices.filter_map(|d| d.name().ok()).filter(|n| seen.insert(n.clone())).collect())
        .unwrap_or_default()
}
