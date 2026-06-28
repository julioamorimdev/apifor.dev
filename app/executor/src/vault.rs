// vault — cofre local cifrado. O VALOR do segredo (ex.: chave Anthropic) nunca
// sai da máquina nem trafega ao cérebro. Cifra XChaCha20-Poly1305; a chave-mestra
// fica em vault.key (0600) no keystore local. M2.1: stand-in do keystore do SO.
use chacha20poly1305::aead::{Aead, KeyInit};
use chacha20poly1305::{Key, XChaCha20Poly1305, XNonce};
use rand::rngs::OsRng;
use rand::RngCore;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::io::Write;
use std::os::unix::fs::OpenOptionsExt;
use std::path::PathBuf;

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct Entry {
    nonce: String, // base64 (24 bytes)
    ct: String,    // base64 (ciphertext)
    #[serde(default)]
    kind: String, // tipo declarado (ex.: "anthropic_api_key")
    fingerprint: String, // sha256(valor)[..12], só p/ exibir/registrar metadado
}

#[derive(serde::Serialize, serde::Deserialize, Default)]
struct Store {
    secrets: BTreeMap<String, Entry>,
}

pub struct Vault {
    home: PathBuf,
    key: [u8; 32],
}

impl Vault {
    fn home() -> PathBuf {
        PathBuf::from(std::env::var("APIFOR_HOME").unwrap_or_else(|_| "/var/lib/apifor".into()))
    }

    /// Abre (ou inicializa) o cofre, gerando a chave-mestra na primeira vez.
    pub fn open() -> std::io::Result<Self> {
        let home = Self::home();
        fs::create_dir_all(&home)?;
        let key_path = home.join("vault.key");
        let key = if key_path.exists() {
            let bytes = fs::read(&key_path)?;
            let mut k = [0u8; 32];
            k.copy_from_slice(&bytes[..32]);
            k
        } else {
            let mut k = [0u8; 32];
            OsRng.fill_bytes(&mut k);
            let mut f = fs::OpenOptions::new()
                .create(true)
                .write(true)
                .truncate(true)
                .mode(0o600)
                .open(&key_path)?;
            f.write_all(&k)?;
            k
        };
        Ok(Self { home, key })
    }

    fn store_path(&self) -> PathBuf {
        self.home.join("vault.json")
    }

    fn load(&self) -> Store {
        match fs::read(self.store_path()) {
            Ok(b) => serde_json::from_slice(&b).unwrap_or_default(),
            Err(_) => Store::default(),
        }
    }

    fn save(&self, s: &Store) -> std::io::Result<()> {
        let mut f = fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .mode(0o600)
            .open(self.store_path())?;
        f.write_all(&serde_json::to_vec_pretty(s).unwrap())?;
        Ok(())
    }

    fn cipher(&self) -> XChaCha20Poly1305 {
        XChaCha20Poly1305::new(Key::from_slice(&self.key))
    }

    pub fn put(&self, name: &str, value: &str, kind: &str) -> std::io::Result<String> {
        let mut nonce = [0u8; 24];
        OsRng.fill_bytes(&mut nonce);
        let ct = self
            .cipher()
            .encrypt(XNonce::from_slice(&nonce), value.as_bytes())
            .map_err(|e| std::io::Error::other(e.to_string()))?;
        let fingerprint = fingerprint(value);
        let mut s = self.load();
        s.secrets.insert(
            name.to_string(),
            Entry {
                nonce: B64.encode(nonce),
                ct: B64.encode(ct),
                kind: kind.to_string(),
                fingerprint: fingerprint.clone(),
            },
        );
        self.save(&s)?;
        Ok(fingerprint)
    }

    pub fn get(&self, name: &str) -> Option<String> {
        let s = self.load();
        let e = s.secrets.get(name)?;
        let nonce = B64.decode(&e.nonce).ok()?;
        let ct = B64.decode(&e.ct).ok()?;
        let pt = self
            .cipher()
            .decrypt(XNonce::from_slice(&nonce), ct.as_ref())
            .ok()?;
        String::from_utf8(pt).ok()
    }

    pub fn delete(&self, name: &str) -> std::io::Result<bool> {
        let mut s = self.load();
        let existed = s.secrets.remove(name).is_some();
        self.save(&s)?;
        Ok(existed)
    }

    /// Lista metadados (nome, tipo, fingerprint) — nunca o valor.
    pub fn list(&self) -> Vec<(String, String, String)> {
        self.load()
            .secrets
            .into_iter()
            .map(|(n, e)| (n, e.kind, e.fingerprint))
            .collect()
    }
}

pub fn fingerprint(value: &str) -> String {
    let mut h = Sha256::new();
    h.update(value.as_bytes());
    let d = h.finalize();
    hex(&d[..6])
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{:02x}", x)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fingerprint_estavel_12_hex() {
        let f = fingerprint("sk-ant-xyz");
        assert_eq!(f.len(), 12);
        assert_eq!(f, fingerprint("sk-ant-xyz")); // determinístico
        assert_ne!(f, fingerprint("outro-valor"));
    }

    #[test]
    fn vault_roundtrip_cifrado() {
        let dir = std::env::temp_dir().join("apifor_vault_test");
        let _ = std::fs::remove_dir_all(&dir);
        std::env::set_var("APIFOR_HOME", &dir);

        let v = Vault::open().expect("open");
        let fp = v
            .put("anthropic_api_key", "sk-ant-segredo", "anthropic_api_key")
            .expect("put");
        assert_eq!(fp.len(), 12);

        // valor recuperado bate; o JSON em disco NÃO contém o segredo em claro
        assert_eq!(
            v.get("anthropic_api_key").as_deref(),
            Some("sk-ant-segredo")
        );
        let disk = std::fs::read_to_string(dir.join("vault.json")).unwrap();
        assert!(
            !disk.contains("sk-ant-segredo"),
            "segredo vazou em claro no disco"
        );

        assert!(v.get("inexistente").is_none());
        assert!(v.delete("anthropic_api_key").expect("delete"));
        assert!(v.get("anthropic_api_key").is_none());

        let _ = std::fs::remove_dir_all(&dir);
    }
}
