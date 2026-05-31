const fs = require('fs');
const path = require('path');

const SMTP_HOST = process.env.SMTP_HOST || ''; // Exemplo: mail.seudominio.com
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'true') === 'true';
const SMTP_USER = process.env.SMTP_USER || ''; // Exemplo: vagas@seudominio.com
const SMTP_PASS = process.env.SMTP_PASS || ''; // Senha do email
const EMAIL_FROM = process.env.EMAIL_FROM || ''; // Opcional: se vazio, usa SMTP_USER como remetente
const EMAIL_TO = process.env.EMAIL_TO || ''; // Exemplo: seuemail@gmail.com
const SENT_JOBS_FILE = path.resolve(__dirname, '../../.data/sent-jobs.json');
const SENT_JOBS_TTL = 7 * 24 * 60 * 60 * 1000; // 7 dias

function isConfigured() {
  return SMTP_HOST && SMTP_USER && SMTP_PASS && EMAIL_TO;
}

function getNodemailer() {
  try {
    return require('nodemailer');
  } catch (error) {
    const missingDependency = new Error('Instale a dependencia nodemailer com npm install no cPanel.');
    missingDependency.statusCode = 500;
    throw missingDependency;
  }
}

function buildJobText(level, job) {
  const analysis = job.analise_ia || {};

  return `
Nova vaga ${level}

Titulo: ${job.titulo_vaga || ''}
Empresa: ${job.nome_empresa || ''}
Local: ${job.local || ''}
Modelo: ${job.forma_trabalho || ''}
Nivel: ${job.nivel || job.nivel_vaga || ''}
Link: ${job.link_vaga || ''}

Resumo da IA:
${analysis.resumo || ''}

Motivo:
${analysis.motivo || ''}

Pontos fortes:
${(analysis.pontos_fortes || []).join('\n')}

Pontos de atencao:
${(analysis.pontos_atencao || []).join('\n')}

Sugestao de preparacao:
${analysis.sugestao_preparacao || ''}

Tecnologias:
${(job.tecnologias || []).join(', ')}

Descricao:
${job.descricao_vaga || ''}

Requisitos:
${job.requisitos_tecnicos || ''}
`;
}

function buildEmail(results) {
  const successfulJobs = Object.entries(results)
    .filter(([, result]) => result.ok && result.data)
    .map(([level, result]) => ({ level, job: result.data }));

  if (successfulJobs.length === 0) {
    return {
      subject: 'Cron vagas: nenhuma vaga adequada encontrada',
      text: `Nenhuma vaga adequada foi encontrada.\n\nResultado:\n${JSON.stringify(results, null, 2)}`,
    };
  }

  return {
    subject: `Nova vaga adequada: ${successfulJobs[0].job.titulo_vaga || successfulJobs[0].level}`,
    text: successfulJobs
      .map(({ level, job }) => buildJobText(level, job))
      .join('\n\n---\n\n'),
  };
}

function getEmailFrom() {
  return EMAIL_FROM || SMTP_USER;
}

function stableText(value) {
  return String(value || '')
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/https?:\/\/(www\.)?/g, '')
    .replace(/[?#].*$/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getJobKey(level, job) {
  const linkKey = stableText(job.link_vaga);
  const slugKey = stableText(job.slug);
  const titleKey = stableText(job.titulo_vaga);
  const companyKey = stableText(job.nome_empresa);

  return [
    stableText(level),
    linkKey || slugKey || titleKey,
    companyKey,
  ].join('|');
}

function getAlternativeJobKeys(level, job) {
  const normalizedLevel = stableText(level);
  const companyKey = stableText(job.nome_empresa);
  const keys = [
    getJobKey(level, job),
    [normalizedLevel, stableText(job.slug), companyKey].join('|'),
    [normalizedLevel, stableText(job.titulo_vaga), companyKey].join('|'),
  ];

  return [...new Set(keys.filter((key) => !key.includes('||')))];
}

function hasJobBeenSent(level, job) {
  const sentJobs = removeExpiredSentJobs(readSentJobs());
  saveSentJobs(sentJobs);

  return getAlternativeJobKeys(level, job).some((key) => sentJobs[key]);
}

function getSuccessfulJobs(results) {
  return Object.entries(results)
    .filter(([, result]) => result.ok && result.data)
    .map(([level, result]) => ({
      level,
      job: result.data,
      key: getJobKey(level, result.data),
      keys: getAlternativeJobKeys(level, result.data),
    }));
}

function readSentJobs() {
  try {
    if (!fs.existsSync(SENT_JOBS_FILE)) {
      return {};
    }

    return JSON.parse(fs.readFileSync(SENT_JOBS_FILE, 'utf8'));
  } catch (error) {
    return {};
  }
}

function saveSentJobs(sentJobs) {
  fs.mkdirSync(path.dirname(SENT_JOBS_FILE), { recursive: true });
  fs.writeFileSync(SENT_JOBS_FILE, JSON.stringify(sentJobs, null, 2));
}

function removeExpiredSentJobs(sentJobs) {
  const now = Date.now();
  const activeJobs = {};

  Object.entries(sentJobs).forEach(([key, value]) => {
    const sentAt = value && value.sent_at ? new Date(value.sent_at).getTime() : 0;

    if (sentAt && now - sentAt <= SENT_JOBS_TTL) {
      activeJobs[key] = value;
    }
  });

  return activeJobs;
}

module.exports = {
  hasJobBeenSent,

  async sendJobResults(results) {
    if (!isConfigured()) {
      return {
        sent: false,
        reason: 'Configure SMTP_HOST, SMTP_USER, SMTP_PASS e EMAIL_TO em src/services/EmailService.js.',
      };
    }

    const successfulJobs = getSuccessfulJobs(results);

    if (successfulJobs.length === 0) {
      return {
        sent: false,
        reason: 'Nenhuma vaga com boa adequacao foi encontrada.',
      };
    }

    if (successfulJobs.length > 0) {
      const sentJobs = removeExpiredSentJobs(readSentJobs());
      saveSentJobs(sentJobs);
      const newJobs = successfulJobs.filter(({ keys }) => !keys.some((key) => sentJobs[key]));

      if (newJobs.length === 0) {
        return {
          sent: false,
          reason: 'A vaga encontrada ja foi enviada anteriormente.',
        };
      }
    }

    const nodemailer = getNodemailer();
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });

    const email = buildEmail(results);

    await transporter.sendMail({
      from: getEmailFrom(),
      to: EMAIL_TO,
      subject: email.subject,
      text: email.text,
    });

    const successfulJobsAfterSend = getSuccessfulJobs(results);
    if (successfulJobsAfterSend.length > 0) {
      const sentJobs = readSentJobs();
      const now = new Date().toISOString();

      successfulJobsAfterSend.forEach(({ keys, job }) => {
        keys.forEach((key) => {
          sentJobs[key] = {
            sent_at: now,
            titulo_vaga: job.titulo_vaga,
            link_vaga: job.link_vaga,
          };
        });
      });

      saveSentJobs(sentJobs);
    }

    return { sent: true };
  },
};
