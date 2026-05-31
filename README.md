# API Vagas

API em Node.js/Express que busca vagas no Meu Padrinho, aplica filtros de perfil e usa Gemini para avaliar aderencia ao curriculo. O cron pode rodar automaticamente no cPanel e enviar por email somente vagas novas com boa adequacao.

## Recursos

- Busca vagas por nivel: estagio, junior, pleno e senior.
- Cron focado em junior e pleno.
- Pre-filtro antes da IA para reduzir consumo de cota.
- Analise com Gemini usando curriculo embutido no prompt.
- Fallback automatico de modelo Gemini.
- Envio de email via SMTP.
- Historico local para nao reenviar vagas repetidas.
- Limpeza automatica do historico apos 7 dias.

## Rotas

| Metodo | Rota | Descricao |
|---|---|---|
| GET | `/` | Lista rotas disponiveis |
| GET | `/estagio` | Busca vaga de estagio |
| GET | `/junior` | Busca vaga junior |
| GET | `/pleno` | Busca vaga pleno |
| GET | `/senior` | Busca vaga senior |
| GET | `/cron/buscar-vagas` | Busca junior e pleno, envia email se encontrar vaga adequada |
| GET | `/cron/buscar-vagas?level=junior` | Busca somente junior |
| GET | `/cron/buscar-vagas?level=pleno` | Busca somente pleno |

## Variaveis De Ambiente

Copie `.env.example` para `.env` no ambiente local ou configure as variaveis no painel do cPanel.

```env
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.1-flash-lite
GEMINI_FALLBACK_MODEL=gemini-2.5-flash

SMTP_HOST=mail.seudominio.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=
EMAIL_TO=
```

`EMAIL_FROM` pode ficar vazio. Nesse caso, o sistema usa `SMTP_USER` como remetente.

## Rodando Localmente

Instale as dependencias:

```bash
npm install
```

Inicie a API:

```bash
npm start
```

Acesse:

```text
http://localhost:2400
```

## Cron No cPanel

Recomendado: criar dois cron jobs separados.

Junior:

```bash
curl -s "https://api-vagas-viktor.viktorware.com/cron/buscar-vagas?level=junior"
```

Pleno:

```bash
curl -s "https://api-vagas-viktor.viktorware.com/cron/buscar-vagas?level=pleno"
```

Para rodar a cada 2 horas:

Junior:

```text
Minute: 0
Hour: */2
Day: *
Month: *
Weekday: *
```

Pleno:

```text
Minute: 30
Hour: */2
Day: *
Month: *
Weekday: *
```

## Criterios De Filtro

Antes de chamar a IA, a API descarta vagas que claramente fogem do perfil, como suporte, infraestrutura, QA, BI, RPA, dados, UX, mobile nativo ou stacks muito distantes.

Tecnologias priorizadas:

```text
PHP, Laravel, Java, Spring Boot, JavaScript, TypeScript, Node.js, React, Vue.js,
Tailwind CSS, SQL Server, PostgreSQL, MySQL, REST APIs, JWT, Docker, Git,
CI/CD, PHPUnit, JUnit, WebSocket e WebRTC.
```

A IA so aprova uma vaga quando `pontuacao_adequacao` for pelo menos `70`.

## Historico De Emails

As vagas enviadas ficam registradas em:

```text
.data/sent-jobs.json
```

Esse arquivo evita reenvio da mesma vaga. Registros com mais de 7 dias sao removidos automaticamente.

## Deploy No cPanel

Arquivos principais para subir:

```text
app.js
index.js
package.json
package-lock.json
src/
.env.example
```

No Setup Node.js App:

```text
Application startup file: app.js
```

Depois rode:

```bash
npm install
```

Configure as variaveis de ambiente no painel e reinicie a aplicacao.
