const express = require('express');
const JobController = require('./controllers/JobController');
const CronController = require('./controllers/CronController');

const routes = express.Router();

routes.get('/', (req, res) => {
  return res.json({
    rotas_disponiveis: ['/estagio', '/junior', '/pleno', '/senior', '/cron/buscar-vagas'],
    repositorio: 'https://github.com/matheusaudibert/jobs-api'
  });
});

routes.get('/estagio', JobController.getEstagio);
routes.get('/junior', JobController.getJunior);
routes.get('/pleno', JobController.getPleno);
routes.get('/senior', JobController.getSenior);
routes.get('/cron/buscar-vagas', CronController.buscarVagas);

module.exports = routes;
