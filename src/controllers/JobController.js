const JobSearchService = require('../services/JobSearchService');

async function getLatestByLevel(req, res, level) {
  try {
    const response = await JobSearchService.getLatestByLevel(level, {
      debugAi: req.query.debug_ai === '1',
    });
    return res.json(response);
  } catch (error) {
    console.error('Erro na rota de vagas:', error.message);

    if (error.statusCode === 429 || error.message.includes('429')) {
      return res.status(429).json({
        error: 'AI quota exceeded',
        message: 'O limite temporario do Gemini foi excedido. Aguarde alguns minutos ou verifique billing/cota do projeto.',
        provider: error.provider,
      });
    }

    return res.status(error.statusCode || 500).json({
      error: 'Internal Server Error',
      message: error.message,
      provider: error.provider,
      code: error.errorCode,
      type: error.errorType,
    });
  }
}

module.exports = {
  getEstagio(req, res) {
    return getLatestByLevel(req, res, 'estagio');
  },
  getJunior(req, res) {
    return getLatestByLevel(req, res, 'junior');
  },
  getPleno(req, res) {
    return getLatestByLevel(req, res, 'pleno');
  },
  getSenior(req, res) {
    return getLatestByLevel(req, res, 'senior');
  }
};
