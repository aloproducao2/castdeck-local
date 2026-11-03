// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Isolamento de processos no Windows via Job Object (KILL_ON_JOB_CLOSE).
// Garante que o servidor Node, FFmpeg, MediaMTX e navegadores DSK fechem
// automaticamente quando o lançador for encerrado, prevenindo portas presas.

#[cfg(windows)]
pub struct ProcessJob {
    job_handle: windows_sys::Win32::Foundation::HANDLE,
}

#[cfg(windows)]
impl ProcessJob {
    pub fn new() -> Option<Self> {
        use windows_sys::Win32::System::JobObjects::*;
        use std::mem::size_of;
        use std::ptr::null;

        unsafe {
            let handle = CreateJobObjectW(null(), null());
            if handle.is_null() {
                return None;
            }

            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

            let res = SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const std::ffi::c_void,
                size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            );

            if res == 0 {
                windows_sys::Win32::Foundation::CloseHandle(handle);
                return None;
            }

            Some(Self { job_handle: handle })
        }
    }

    pub fn assign_process(&self, process_handle: windows_sys::Win32::Foundation::HANDLE) -> bool {
        use windows_sys::Win32::System::JobObjects::AssignProcessToJobObject;
        unsafe {
            AssignProcessToJobObject(self.job_handle, process_handle) != 0
        }
    }
}

#[cfg(windows)]
unsafe impl Send for ProcessJob {}

#[cfg(windows)]
unsafe impl Sync for ProcessJob {}

#[cfg(windows)]
impl Drop for ProcessJob {
    fn drop(&mut self) {
        unsafe {
            if !self.job_handle.is_null() {
                windows_sys::Win32::Foundation::CloseHandle(self.job_handle);
            }
        }
    }
}

#[cfg(not(windows))]
pub struct ProcessJob;

#[cfg(not(windows))]
impl ProcessJob {
    pub fn new() -> Option<Self> {
        Some(Self)
    }
    pub fn assign_process<T>(&self, _process: T) -> bool {
        true
    }
}
