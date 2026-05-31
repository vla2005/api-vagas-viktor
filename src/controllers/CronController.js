const JobSearchService = require('../services/JobSearchService');
const EmailService = require('../services/EmailService');

const CRON_SECRET = ''; // Opcional: coloque uma senha aqui para proteger a rota do cron

function isAuthorized(req) {
  if (!CRON_SECRET) {
    return true;
  }

  return req.query.token === CRON_SECRET || req.headers['x-cron-token'] === CRON_SECRET;
}

module.exports = {
  async buscarVagas(req, res) {
    if (!isAuthorized(req)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const startedAt = new Date();
      const results = req.query.level
        ? await JobSearchService.refreshLevel(req.query.level)
        : await JobSearchService.refreshAllLevels();
      const email = await EmailService.sendJobResults(results);

      return res.json({
        ok: true,
        started_at: startedAt.toISOString(),
        finished_at: new Date().toISOString(),
        email,
        results,
      });
    } catch (error) {
      console.error('Erro na rota do cron:', error.message);
      return res.status(error.statusCode || 500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  },
};
