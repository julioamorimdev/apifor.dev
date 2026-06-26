fn main() {
    tonic_build::compile_protos("proto/apifor.proto").expect("falha ao compilar apifor.proto");
}
