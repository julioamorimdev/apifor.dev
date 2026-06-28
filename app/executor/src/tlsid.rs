// tlsid — identidade mTLS do device. Gera par de chaves + CSR LOCAL; a chave
// privada nunca sai da máquina (vai só o CSR ao cérebro, que assina o cert).
use rcgen::{CertificateParams, DnType};

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
