# sample-service

Serviço HTTP de exemplo usado como **workspace local** do executor no M2.1.
O relay de planejamento lê arquivos daqui (refs de contexto) para preencher o
prompt — esse conteúdo fica **local**, nunca trafega ao cérebro.

## Endpoints atuais

- `GET /` — página inicial
- `GET /version` — versão do serviço

## Estrutura

- `main.go` — servidor HTTP e rotas
- `README.md` — este arquivo
