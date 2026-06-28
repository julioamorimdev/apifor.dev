// tlsid — identidade mTLS do device. Gera par de chaves + CSR LOCAL; a chave
// privada nunca sai da máquina (vai só o CSR ao cérebro, que assina o cert).
// M4.2: persiste cert+chave p/ reconectar como o MESMO device (reconciliação).
use rcgen::{CertificateParams, DnType};
use std::path::PathBuf;

fn home() -> PathBuf {
    PathBuf::from(std::env::var("APIFOR_HOME").unwrap_or_else(|_| "/var/lib/apifor".into()))
}
fn id_paths() -> (PathBuf, PathBuf) {
    (home().join("device.crt"), home().join("device.key"))
}

/// Carrega a identidade salva (cert_pem, key_pem), se existir.
pub fn load_identity() -> Option<(Vec<u8>, String)> {
    let (crt, key) = id_paths();
    let c = std::fs::read(&crt).ok()?;
    let k = std::fs::read_to_string(&key).ok()?;
    if c.is_empty() || k.is_empty() {
        return None;
    }
    Some((c, k))
}

/// Salva a identidade (cert assinado pela CA + chave privada local, 0600).
pub fn save_identity(cert_pem: &[u8], key_pem: &str) {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;
    let _ = std::fs::create_dir_all(home());
    let (crt, key) = id_paths();
    let _ = std::fs::write(&crt, cert_pem);
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).write(true).truncate(true).mode(0o600).open(&key) {
        let _ = f.write_all(key_pem.as_bytes());
    }
}

/// Apaga a identidade (p/ re-enroll no próximo start, ex.: cert revogado/CA trocada).
pub fn clear_identity() {
    let (crt, key) = id_paths();
    let _ = std::fs::remove_file(crt);
    let _ = std::fs::remove_file(key);
}

/// Gera (csr_pem, private_key_pem). O CN real é definido pelo cérebro ao assinar.
pub fn make_csr() -> (String, String) {
    let mut params = CertificateParams::new(vec!["apifor-device".to_string()]);
    params
        .distinguished_name
        .push(DnType::CommonName, "apifor-device");
    let cert = rcgen::Certificate::from_params(params).expect("rcgen params");
    let csr = cert.serialize_request_pem().expect("csr pem");
    let key = cert.serialize_private_key_pem();
    (csr, key)
}
