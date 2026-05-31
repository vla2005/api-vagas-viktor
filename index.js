require('dotenv').config();

const express = require('express');
const routes = require('./src/routes');

const app = express();

app.use(express.json());
app.use(routes);

const PORT = process.env.PORT || 2400;

const server = app.listen(PORT, () => {
  console.log(`Servidor iniciado em http://localhost:${PORT}`);
  console.log(`Rotas disponíveis: /estagio, /junior, /pleno, /senior`);
});

server.on('error', (error) => {
  console.error('Erro ao iniciar o servidor:', error.message);
});
