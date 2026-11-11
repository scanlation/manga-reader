use std::sync::{Mutex, PoisonError};
use std::{collections::HashMap, sync::atomic::{AtomicU32, Ordering}};

use crate::sources::Backend;

/// 已打开书籍源的注册表：句柄 -> 后端实现。
/// 前端每打开一个文件/文件夹获得一个句柄，翻页时按路径读取单页。
pub struct Sources {
    inner: Mutex<HashMap<u32, Backend>>,
    next: AtomicU32,
}

impl Sources {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(HashMap::new()),
            next: AtomicU32::new(1),
        }
    }

    pub fn insert(&self, backend: Backend) -> u32 {
        let id = self.next.fetch_add(1, Ordering::Relaxed);
        self.inner
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .insert(id, backend);
        id
    }

    pub fn with<T>(
        &self,
        handle: u32,
        f: impl FnOnce(&Backend) -> Result<T, String>,
    ) -> Result<T, String> {
        let guard = self
            .inner
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        let backend = guard
            .get(&handle)
            .ok_or_else(|| "err.handleNotFound".to_string())?;
        f(backend)
    }

    pub fn remove(&self, handle: u32) -> Result<(), String> {
        let mut guard = self
            .inner
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        match guard.remove(&handle) {
            Some(mut backend) => {
                backend.close();
                Ok(())
            }
            None => Err("err.handleNotFound".to_string()),
        }
    }
}
