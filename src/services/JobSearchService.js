const MeuPadrinhoService = require('./MeuPadrinhoService');
const GeminiService = require('./GeminiService');
const EmailService = require('./EmailService');

const CRON_LEVELS = ['estagio','junior', 'pleno'];
const cache = {};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos
const MAX_AI_ANALYSES_PER_LEVEL = 3;
const CRON_LEVEL_DELAY = 30 * 1000; // 30 segundos

const normalize = (str) => String(str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const PROFILE_KEYWORDS = [
  'desenvolvedor',
  'desenvolvedora',
  'developer',
  'dev ',
  'dev.',
  'full stack',
  'fullstack',
  'backend',
  'back-end',
  'frontend',
  'front-end',
  'software',
  'programador',
  'programadora',
  'engenheiro de software',
  'analista de sistemas',
  'web',
  'php',
  'laravel',
  'java',
  'spring',
  'spring boot',
  'javascript',
  'typescript',
  'vue',
  'react',
  'node',
  'sql',
  'mysql',
  'postgresql',
];

const EXCLUDED_KEYWORDS = [
  'suporte',
  'help desk',
  'service desk',
  'infraestrutura',
  'infra ',
  'redes',
  'monitoria',
  'monitoramento',
  'automacao rpa',
  'rpa',
  'power platform',
  'power bi',
  'power apps',
  'qa',
  'qualidade',
  'tester',
  'testes',
  'dados',
  'data analyst',
  'cientista de dados',
  'produto',
  'scrum master',
  'ux',
  'ui designer',
  'wordpress',
  'angular',
  '.net',
  'c#',
  'ruby',
  'python',
  'django',
  'flask',
  'go ',
  'golang',
  'flutter',
  'react native',
  'mobile',
  'android',
  'ios',
  'devops',
  'sre',
  'aws',
  'azure',
  'gcp',
  'kubernetes',
];

const OWNED_TECH_KEYWORDS = [
  'php',
  'laravel',
  'java',
  'spring',
  'spring boot',
  'javascript',
  'typescript',
  'vue',
  'vue.js',
  'react',
  'html',
  'css',
  'tailwind',
  'mysql',
  'postgresql',
  'sql server',
  'sql',
  'rest',
  'api',
  'jwt',
  'junit',
  'phpunit',
  'ci/cd',
  'github',
  'websocket',
  'webrtc',
  'gemini',
];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasAnyKeyword(text, keywords) {
  const normalizedText = normalize(text);
  return keywords.some((keyword) => normalizedText.includes(keyword));
}

function buildSearchText(...parts) {
  return parts.filter(Boolean).join(' ');
}

function isPotentialDevelopmentJob(job) {
  const titleText = buildSearchText(job.titulo_vaga, job.titulo, job.cargo, job.slug);

  if (hasAnyKeyword(titleText, EXCLUDED_KEYWORDS) && !hasAnyKeyword(titleText, PROFILE_KEYWORDS)) {
    return false;
  }

  return hasAnyKeyword(titleText, PROFILE_KEYWORDS);
}

function isPotentialProfileMatch(jobDetails, technologies = []) {
  const fullText = buildSearchText(
    jobDetails.titulo_vaga,
    jobDetails.cargo,
    jobDetails.slug,
    jobDetails.descricao_vaga,
    jobDetails.requisitos_tecnicos,
    jobDetails.requisitos_desejaveis,
    technologies.join(' ')
  );

  if (!hasAnyKeyword(fullText, PROFILE_KEYWORDS)) {
    return false;
  }

  if (!hasAnyKeyword(fullText, OWNED_TECH_KEYWORDS)) {
    return false;
  }

  if (hasAnyKeyword(fullText, EXCLUDED_KEYWORDS) && !hasAnyKeyword(fullText, OWNED_TECH_KEYWORDS)) {
    return false;
  }

  const titleText = buildSearchText(jobDetails.titulo_vaga, jobDetails.cargo, jobDetails.slug);
  if (hasAnyKeyword(titleText, EXCLUDED_KEYWORDS) && !hasAnyKeyword(titleText, ['desenvolvedor', 'developer', 'software', 'full stack', 'backend', 'frontend'])) {
    return false;
  }

  return true;
}

function isBrasiliaLocation(local) {
  const normalizedLocal = normalize(local);
  return normalizedLocal.includes('brasilia')
    || normalizedLocal.includes('distrito federal')
    || /\bdf\b/.test(normalizedLocal);
}

function isAllowedByLocation(jobDetails) {
  const workMode = normalize(jobDetails.forma_trabalho);

  if (workMode.includes('remoto') || workMode.includes('remote')) {
    return true;
  }

  if (workMode.includes('presencial') || workMode.includes('hibrid') || workMode.includes('hybrid')) {
    return isBrasiliaLocation(jobDetails.local);
  }

  return true;
}

function buildJobResponse(jobDetails, jobTechnologies) {
  return {
    titulo_vaga: jobDetails.titulo_vaga,
    local: jobDetails.local,
    horario_registro: jobDetails.horario_registro,
    link_vaga: jobDetails.link_vaga,
    plataforma: jobDetails.plataforma,
    forma_trabalho: jobDetails.forma_trabalho,
    cargo: jobDetails.cargo,
    nivel: jobDetails.nivel,
    slug: jobDetails.slug,
    descricao_vaga: jobDetails.descricao_vaga,
    requisitos_tecnicos: jobDetails.requisitos_tecnicos,
    beneficios_empresa: jobDetails.beneficios_empresa,
    requisitos_desejaveis: jobDetails.requisitos_desejaveis,
    nivel_vaga: jobDetails.nivel_vaga,
    tipo_contrato: jobDetails.tipo_contrato,
    salario: jobDetails.salario,
    email_contato: jobDetails.email_contato,
    nome_empresa: jobDetails.nome_empresa,
    link_pagina_linkedin: jobDetails.link_pagina_linkedin,
    link_empresa: jobDetails.link_empresa,
    tecnologias: jobTechnologies ? jobTechnologies.tecnologias : [],
  };
}

function createSearchStats(level) {
  return {
    level,
    listed_jobs: 0,
    skipped_level: 0,
    skipped_title_prefilter: 0,
    fetched_details: 0,
    skipped_detail_level: 0,
    skipped_location: 0,
    skipped_tech_prefilter: 0,
    skipped_already_sent: 0,
    skipped_already_analyzed: 0,
    ai_analyses_started: 0,
    ai_rejected: 0,
    ai_low_score: 0,
    ai_temporary_errors: 0,
    max_ai_analyses_reached: false,
  };
}

async function getLatestByLevel(level, options = {}) {
  const now = Date.now();
  const forceRefresh = Boolean(options.forceRefresh);
  const stats = createSearchStats(level);

  if (!cache[level]) {
    cache[level] = { data: null, time: 0 };
  }

  if (!forceRefresh && cache[level].data && (now - cache[level].time < CACHE_DURATION)) {
    return cache[level].data;
  }

  const listResponse = await MeuPadrinhoService.getLatestJobs(level);

  if (!listResponse || !listResponse.vagas || listResponse.vagas.length === 0) {
    const error = new Error(`No jobs found for level: ${level}`);
    error.statusCode = 404;
    throw error;
  }

  const targetLevel = normalize(level);
  let aiAnalyses = 0;

  for (const vaga of listResponse.vagas) {
    stats.listed_jobs += 1;

    if (!vaga.nivel || normalize(vaga.nivel) !== targetLevel) {
      stats.skipped_level += 1;
      continue;
    }

    if (!isPotentialDevelopmentJob(vaga)) {
      stats.skipped_title_prefilter += 1;
      continue;
    }

    const [jobDetails, jobTechnologies] = await Promise.all([
      MeuPadrinhoService.getJobDetails(vaga.nano_id),
      MeuPadrinhoService.getJobTechnologies(vaga.nano_id)
    ]);
    stats.fetched_details += 1;

    const detailLevel = jobDetails.nivel || jobDetails.nivel_vaga || '';
    if (normalize(detailLevel) !== targetLevel) {
      stats.skipped_detail_level += 1;
      continue;
    }

    if (!isAllowedByLocation(jobDetails)) {
      stats.skipped_location += 1;
      continue;
    }

    const technologies = jobTechnologies ? jobTechnologies.tecnologias : [];
    if (!isPotentialProfileMatch(jobDetails, technologies)) {
      stats.skipped_tech_prefilter += 1;
      continue;
    }

    const candidateResponse = buildJobResponse(jobDetails, jobTechnologies);

    if (EmailService.hasJobBeenSent(level, candidateResponse)) {
      stats.skipped_already_sent += 1;
      continue;
    }

    const previousAnalysis = EmailService.getAnalyzedJob(level, candidateResponse);
    if (previousAnalysis && !previousAnalysis.adequada) {
      stats.skipped_already_analyzed += 1;
      continue;
    }

    if (aiAnalyses >= MAX_AI_ANALYSES_PER_LEVEL) {
      stats.max_ai_analyses_reached = true;
      break;
    }

    aiAnalyses += 1;
    stats.ai_analyses_started += 1;
    try {
      candidateResponse.analise_ia = await GeminiService.analyzeJob(candidateResponse);
      EmailService.markJobAnalyzed(level, candidateResponse, candidateResponse.analise_ia);
    } catch (error) {
      if (!error.isTemporary) {
        throw error;
      }

      stats.ai_temporary_errors += 1;
      candidateResponse.analise_ia = {
        adequada: false,
        pontuacao_adequacao: 0,
        motivo: 'A vaga passou nos filtros basicos, mas o Gemini excedeu a cota e nao analisou o curriculo neste ciclo.',
        resumo: candidateResponse.descricao_vaga || '',
        pontos_fortes: [],
        pontos_atencao: ['Analise da IA indisponivel por limite temporario de quota.'],
        sugestao_preparacao: 'Revise manualmente a vaga antes de se candidatar.',
      };
    }

    if (!candidateResponse.analise_ia.adequada) {
      stats.ai_rejected += 1;
      continue;
    }

    if (Number(candidateResponse.analise_ia.pontuacao_adequacao || 0) < 70) {
      candidateResponse.analise_ia.adequada = false;
      stats.ai_low_score += 1;
      continue;
    }

    candidateResponse.search_stats = stats;
    cache[level].data = candidateResponse;
    cache[level].time = Date.now();

    return candidateResponse;
  }

  const error = new Error(`Nenhuma vaga adequada encontrada para o nivel: ${level}`);
  error.statusCode = 404;
  error.searchStats = stats;
  throw error;
}

async function refreshAllLevels() {
  const results = {};

  for (const level of CRON_LEVELS) {
    try {
      results[level] = {
        ok: true,
        data: await getLatestByLevel(level, { forceRefresh: true }),
      };
    } catch (error) {
      results[level] = {
        ok: false,
        error: error.message,
        stats: error.searchStats,
      };
    }

    if (level !== CRON_LEVELS[CRON_LEVELS.length - 1]) {
      await wait(CRON_LEVEL_DELAY);
    }
  }

  return results;
}

async function refreshLevel(level) {
  if (!CRON_LEVELS.includes(level)) {
    const error = new Error(`Invalid cron level: ${level}`);
    error.statusCode = 400;
    throw error;
  }

  try {
    return {
      [level]: {
        ok: true,
        data: await getLatestByLevel(level, { forceRefresh: true }),
      },
    };
  } catch (error) {
    return {
      [level]: {
        ok: false,
        error: error.message,
        stats: error.searchStats,
      },
    };
  }
}

module.exports = {
  CRON_LEVELS,
  getLatestByLevel,
  refreshLevel,
  refreshAllLevels,
};
