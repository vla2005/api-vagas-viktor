const fs = require('fs');
const path = require('path');

const SMTP_HOST = process.env.SMTP_HOST || ''; // Exemplo: mail.seudominio.com
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'true') === 'true';
const SMTP_USER = process.env.SMTP_USER || ''; // Exemplo: vagas@seudominio.com
const SMTP_PASS = process.env.SMTP_PASS || ''; // Senha do email
const EMAIL_FROM = process.env.EMAIL_FROM || ''; // Opcional: se vazio, usa SMTP_USER como remetente
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'Vagas Viktor';
const EMAIL_TO = process.env.EMAIL_TO || ''; // Exemplo: seuemail@gmail.com
const SENT_JOBS_FILE = path.resolve(__dirname, '../../.data/sent-jobs.json');
const ANALYZED_JOBS_FILE = path.resolve(__dirname, '../../.data/analyzed-jobs.json');
const SENT_JOBS_TTL = 7 * 24 * 60 * 60 * 1000; // 7 dias
const ANALYZED_JOBS_TTL = 3 * 24 * 60 * 60 * 1000; // 3 dias

function isConfigured() {
  return SMTP_HOST && SMTP_USER && SMTP_PASS && EMAIL_TO;
}

function getNodemailer() {
  try {
    return require('nodemailer');
  } catch (error) {
    const missingDependency = new Error('Instale a dependência nodemailer com npm install no cPanel.');
    missingDependency.statusCode = 500;
    throw missingDependency;
  }
}

function getPdfKit() {
  try {
    return require('pdfkit');
  } catch (error) {
    const missingDependency = new Error('Instale a dependência pdfkit com npm install no cPanel.');
    missingDependency.statusCode = 500;
    throw missingDependency;
  }
}

function buildJobText(level, job) {
  const analysis = job.analise_ia || {};

  return `
Nova vaga ${level}

Título: ${job.titulo_vaga || ''}
Empresa: ${job.nome_empresa || ''}
Local: ${job.local || ''}
Modelo: ${job.forma_trabalho || ''}
Nível: ${job.nivel || job.nivel_vaga || ''}
Link: ${job.link_vaga || ''}

Descrição:
${job.descricao_vaga || ''}

Requisitos:
${job.requisitos_tecnicos || ''}

Tecnologias:
${(job.tecnologias || []).join(', ')}

Resumo da IA:
${analysis.resumo || ''}

Motivo:
${analysis.motivo || ''}

Sugestão de preparação:
${analysis.sugestao_preparacao || ''}

Pontos fortes:
${(analysis.pontos_fortes || []).join('\n')}

Pontos de atenção:
${(analysis.pontos_atencao || []).join('\n')}
`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatEmailText(value) {
  const text = escapeHtml(value || 'Não informado.');

  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n/g, '<br>');
}

function buildList(items) {
  const listItems = (items || []).filter(Boolean);

  if (listItems.length === 0) {
    return `
      <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.35;">
        Não informado.
      </p>
    `;
  }

  return `
    <ul style="margin:0;padding:0 0 0 16px;color:#374151;font-size:12px;line-height:1.35;">
      ${listItems
        .map((item) => `
          <li style="margin:0 0 4px 0;">
            ${escapeHtml(item)}
          </li>
        `)
        .join('')}
    </ul>
  `;
}

function buildTagList(items) {
  const tags = (items || []).filter(Boolean);

  if (tags.length === 0) {
    return `
      <span style="color:#6b7280;font-size:12px;">
        Não informado
      </span>
    `;
  }

  return tags
    .slice(0, 18)
    .map((item) => `
      <span style="display:inline-block;margin:0 4px 5px 0;padding:3px 7px;border:1px solid #d1d5db;border-radius:999px;background:#ffffff;color:#374151;font-size:11px;line-height:1.1;white-space:nowrap;">
        ${escapeHtml(item)}
      </span>
    `)
    .join('');
}

function buildScoreBar(score) {
  const safeScore = Math.max(0, Math.min(100, Number(score || 0)));

  return `
    <div style="margin-top:8px;">
      <table role="presentation" style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:0;width:100%;">
            <div style="height:6px;background:#e5e7eb;border-radius:999px;overflow:hidden;">
              <div style="width:${safeScore}%;height:6px;background:#111827;border-radius:999px;"></div>
            </div>
          </td>
          <td style="padding:0 0 0 8px;width:58px;text-align:right;color:#111827;font-size:12px;font-weight:700;white-space:nowrap;">
            ${safeScore}/100
          </td>
        </tr>
      </table>
    </div>
  `;
}

function buildMetaItem(label, value) {
  return `
    <td style="padding:0 8px 6px 0;vertical-align:top;">
      <div style="color:#6b7280;font-size:10px;line-height:1.15;text-transform:uppercase;letter-spacing:.04em;">
        ${escapeHtml(label)}
      </div>
      <div style="color:#111827;font-size:12px;line-height:1.25;font-weight:700;">
        ${escapeHtml(value || 'Não informado')}
      </div>
    </td>
  `;
}

function buildTextSection(title, body) {
  return `
    <div style="margin:0 0 10px 0;">
      <h2 style="margin:0 0 4px 0;color:#111827;font-size:13px;line-height:1.2;">
        ${escapeHtml(title)}
      </h2>
      <p style="margin:0;color:#374151;font-size:12px;line-height:1.4;">
        ${formatEmailText(body)}
      </p>
    </div>
  `;
}

function buildJobHtml(level, job) {
  const analysis = job.analise_ia || {};
  const score = analysis.pontuacao_adequacao || 0;
  const link = job.link_vaga || '';

  return `
    <div style="max-width:720px;margin:0 auto 14px auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#111827;">
      <div style="padding:14px 16px 10px 16px;border-bottom:1px solid #e5e7eb;">
        <table role="presentation" style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="vertical-align:top;padding:0;">
              <div style="margin:0 0 4px 0;color:#6b7280;font-size:10px;line-height:1.2;text-transform:uppercase;letter-spacing:.08em;font-weight:700;">
                Nova vaga ${escapeHtml(level)}
              </div>

              <h1 style="margin:0;color:#111827;font-size:18px;line-height:1.18;font-weight:800;">
                ${escapeHtml(job.titulo_vaga || 'Vaga encontrada')}
              </h1>

              <p style="margin:4px 0 0 0;color:#4b5563;font-size:13px;line-height:1.25;">
                ${escapeHtml(job.nome_empresa || 'Empresa não informada')}
              </p>
            </td>

            <td style="width:96px;text-align:right;vertical-align:top;padding:0;">
              ${link ? `
                <a href="${escapeHtml(link)}" style="display:inline-block;padding:8px 10px;background:#111827;color:#ffffff;text-decoration:none;border-radius:7px;font-size:12px;line-height:1;font-weight:700;white-space:nowrap;">
                  Abrir vaga
                </a>
              ` : ''}
            </td>
          </tr>
        </table>

        ${buildScoreBar(score)}
      </div>

      <div style="padding:12px 16px 14px 16px;">
        <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 6px 0;">
          <tr>
            ${buildMetaItem('Local', job.local)}
            ${buildMetaItem('Modelo', job.forma_trabalho)}
            ${buildMetaItem('Nível', job.nivel || job.nivel_vaga)}
          </tr>
        </table>

        <div style="padding:10px 0 8px 0;border-top:1px solid #f3f4f6;border-bottom:1px solid #f3f4f6;margin-bottom:10px;">
          ${buildTextSection('Descrição da vaga', job.descricao_vaga)}
          ${buildTextSection('Requisitos', job.requisitos_tecnicos)}

          <div style="margin:0;">
            <h2 style="margin:0 0 5px 0;color:#111827;font-size:13px;line-height:1.2;">
              Tecnologias
            </h2>
            ${buildTagList(job.tecnologias)}
          </div>
        </div>

        <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 10px 0;">
          <tr>
            <td style="width:50%;vertical-align:top;padding:0 7px 0 0;">
              <h2 style="margin:0 0 4px 0;color:#111827;font-size:13px;line-height:1.2;">
                Resumo da IA
              </h2>
              <p style="margin:0;color:#374151;font-size:12px;line-height:1.4;">
                ${formatEmailText(analysis.resumo)}
              </p>
            </td>

            <td style="width:50%;vertical-align:top;padding:0 0 0 7px;">
              <h2 style="margin:0 0 4px 0;color:#111827;font-size:13px;line-height:1.2;">
                Preparação
              </h2>
              <p style="margin:0;color:#374151;font-size:12px;line-height:1.4;">
                ${formatEmailText(analysis.sugestao_preparacao)}
              </p>
            </td>
          </tr>
        </table>

        <div style="margin:0 0 10px 0;padding:8px 10px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">
          <h2 style="margin:0 0 4px 0;color:#111827;font-size:13px;line-height:1.2;">
            Por que combina
          </h2>
          <p style="margin:0;color:#374151;font-size:12px;line-height:1.4;">
            ${formatEmailText(analysis.motivo)}
          </p>
        </div>

        <table role="presentation" style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="width:50%;vertical-align:top;padding:0 7px 0 0;">
              <div style="padding:8px 10px;border:1px solid #e5e7eb;border-radius:8px;">
                <h2 style="margin:0 0 5px 0;color:#111827;font-size:13px;line-height:1.2;">
                  Pontos fortes
                </h2>
                ${buildList(analysis.pontos_fortes)}
              </div>
            </td>

            <td style="width:50%;vertical-align:top;padding:0 0 0 7px;">
              <div style="padding:8px 10px;border:1px solid #e5e7eb;border-radius:8px;">
                <h2 style="margin:0 0 5px 0;color:#111827;font-size:13px;line-height:1.2;">
                  Pontos de atenção
                </h2>
                ${buildList(analysis.pontos_atencao)}
              </div>
            </td>
          </tr>
        </table>
      </div>
    </div>
  `;
}

function buildEmailFromJobs(jobs, fallbackResults) {
  if (jobs.length === 0) {
    return {
      subject: 'Cron vagas: nenhuma vaga adequada encontrada',
      text: `Nenhuma vaga adequada foi encontrada.\n\nResultado:\n${JSON.stringify(fallbackResults, null, 2)}`,
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:720px;margin:0 auto;padding:24px;">
          <h1 style="font-size:20px;color:#111827;">Nenhuma vaga adequada foi encontrada</h1>
          <pre style="white-space:pre-wrap;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px;color:#374151;">${escapeHtml(JSON.stringify(fallbackResults, null, 2))}</pre>
        </div>
      `,
    };
  }

  return {
    subject: `Nova vaga adequada: ${jobs[0].job.titulo_vaga || jobs[0].level}`,
    text: jobs
      .map(({ level, job }) => buildJobText(level, job))
      .join('\n\n---\n\n'),
    html: `
      <div style="margin:0;padding:12px;background:#f6f7f9;">
        ${jobs.map(({ level, job }) => buildJobHtml(level, job)).join('')}
        <p style="max-width:720px;margin:0 auto;color:#9ca3af;font-family:Arial,Helvetica,sans-serif;font-size:10px;text-align:center;line-height:1.3;">
          E-mail gerado automaticamente pela automação de vagas.
        </p>
      </div>
    `,
  };
}
const CLEAN_RESUME_PAGE = {
  width: 595.28,
  height: 935.43,
  margin: 28.35,
};

const CLEAN_EXPERIENCES = [
  {
    title: 'SERVIÇO FEDERAL DE PROCESSAMENTO DE DADOS - SERPRO | Brasília - DF',
    role: 'Engenheiro de Software Júnior | Abril 2024 -- Abril 2026',
    items: [
      'Atuei na migração de sistema legado para uma arquitetura mais moderna, garantindo continuidade das funcionalidades e apoiando a estabilização de bugs e erros durante a transição e novas releases.',
      'Otimizei queries e implementei cache em APIs REST, reduzindo o tempo de resposta de 5 segundos para menos de 1 segundo e eliminando quedas durante picos de tráfego.',
      'Atuei em melhorias de acessibilidade no front-end, ampliando a usabilidade e a conformidade com boas práticas de acessibilidade.',
      'Desenvolvi e mantive APIs REST com PHP/Laravel e Java/Spring Boot e interfaces web com Vue.js e React para integração entre módulos e sistemas.',
      'Mantive bancos de dados relacionais, consultas SQL, listagens e relatórios, com testes em JUnit e PHPUnit e apoio a fluxos de entrega via Git, GitHub, Docker e CI/CD.',
    ],
  },
  {
    title: 'Freelance Full Stack - Sistema de Gestão de Oficina Mecânica | Brasília, DF - Nov 2025',
    items: [
      'Substituí o controle manual por planilhas e calculadora por um sistema completo de gestão, automatizando a geração de ordens de serviço e cálculos financeiros antes realizados manualmente.',
      'Desenvolvi a aplicação full stack com Laravel, Vue.js, MySQL e Tailwind CSS, incluindo dashboard interativo para acompanhamento de clientes, serviços e financeiro em tempo real.',
      'Implementei autenticação com Laravel Sanctum, 2FA com Google Authenticator e filas com Laravel Queues, garantindo segurança e processamento assíncrono de tarefas.',
    ],
  },
  {
    title: 'Freelance - Landing Page Disk Baterias DF | Brasília, DF - Mai 2026',
    items: [
      'Desenvolvi uma landing page responsiva com React e Tailwind CSS, seguindo abordagem mobile-first.',
      'Realizei ajustes de layout, performance, responsividade e experiência do usuário.',
    ],
  },
];

const CLEAN_PROJECTS = [
  {
    title: 'NutriTreino - Sistema de Gestão Nutricional e Treinos | Mar - Mai 2026',
    items: [
      'Centralizei em um único sistema informações antes dispersas entre PDFs, WhatsApp e chamadas de vídeo em plataformas separadas, reduzindo confusão e perda de dados entre profissional e paciente/aluno.',
      'Integrei a IA Gemini para gerar rascunhos de dietas e treinos personalizados, economizando tempo do profissional e apoiando a criação de refeições e exercícios adequados a cada paciente.',
      'Desenvolvi dois dashboards: um para o profissional gerenciar pacientes/alunos e planos e outro para o paciente/aluno acessar dieta, treino e gráficos de evolução baseados nos check-ins semanais.',
      'Desenvolvi a aplicação full stack com Laravel, React.js e Vite, incluindo chat em tempo real com WebSocket, videochamada via WebRTC e upload de fotos de evolução corporal.',
    ],
  },
  {
    title: 'Automação Inteligente de Busca de Vagas | Mai 2026',
    items: [
      'Desenvolvido em Node.js com integração à IA Gemini para análise de aderência entre vagas e currículo.',
      'Automatiza a busca, filtragem e avaliação de oportunidades, priorizando vagas compatíveis com o perfil do candidato.',
      'Envia notificações por e-mail com avaliação de compatibilidade, currículo otimizado em anexo e link direto para candidatura.',
      'Deploy em AWS EC2, com PM2, Nginx como proxy reverso e execução recorrente por cron jobs.',
      'Pipeline de CI/CD com GitHub Actions, autenticação federada via OIDC e deploy automatizado pelo AWS Systems Manager.',
    ],
  },
  {
    title: 'Automação de Ofertas com Shopee Afiliados e Telegram | Jun 2026',
    items: [
      'Desenvolvido em Java com Spring Boot, Maven, Docker e arquitetura em camadas.',
      'Integra-se à API GraphQL de Afiliados da Shopee para buscar produtos em promoção periodicamente.',
      'Envia automaticamente ofertas para um grupo do Telegram.',
      'https://t.me/viktorwareofertas',
    ],
  },
];

function normalizeResumeText(value) {
  return String(value || '')
    .replace(/\\href\{[^}]+\}\{([^}]+)\}/g, '$1')
    .replace(/\\textbf\{([^{}]+)\}/g, '$1')
    .replace(/\\textit\{([^{}]+)\}/g, '$1')
    .replace(/\\\\(?:\[[^\]]+\])?/g, '\n')
    .replace(/\\[a-zA-Z]+(?:\[[^\]]*\])?(?:\{[^}]*\})?/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractResumeSummary(content) {
  const match = String(content || '').match(/\\section\{Resumo Profissional\}([\s\S]*?)(?=\\section\{|\\end\{document\}|$)/i);
  const summary = match ? normalizeResumeText(match[1]) : '';

  if (!summary || /Ãƒ|Ã‚|Ã¢/.test(summary)) {
    return 'Engenheiro de Software full stack com 2 anos de experiência, com foco em Java, PHP, JavaScript e arquitetura escalável. Experiência na construção de APIs REST aplicando Clean Architecture, Clean Code, otimizações e SOLID.';
  }

  return summary;
}

function buildResumePdfClean(content) {
  const PDFDocument = getPdfKit();
  const doc = new PDFDocument({
    margin: CLEAN_RESUME_PAGE.margin,
    size: [CLEAN_RESUME_PAGE.width, CLEAN_RESUME_PAGE.height],
    autoFirstPage: true,
  });

  const chunks = [];
  const left = CLEAN_RESUME_PAGE.margin;
  const right = CLEAN_RESUME_PAGE.width - CLEAN_RESUME_PAGE.margin;
  const width = right - left;
  let y = 30;

  function text(value, x, top, options = {}) {
    doc
      .font(options.bold ? 'Helvetica-Bold' : options.italic ? 'Helvetica-Oblique' : 'Helvetica')
      .fontSize(options.size || 9)
      .fillColor('#111111')
      .text(value, x, top, {
        width: options.width || width,
        align: options.align || 'left',
        lineGap: options.lineGap || 0,
      });

    return doc.y;
  }

  function section(title) {
    y += 8;
    y = text(title, left, y, { bold: true, size: 12 }) + 2;
    doc
      .moveTo(left, y)
      .lineTo(right, y)
      .lineWidth(0.45)
      .strokeColor('#111111')
      .stroke();
    y += 5;
  }

  function paragraph(value) {
    y = text(value, left, y, { size: 8.9, lineGap: 0.5 }) + 2;
  }

  function skill(label, value) {
    doc.font('Helvetica-Bold').fontSize(8.75).fillColor('#111111');
    doc.text(`${label}: `, left, y, { width, continued: true, lineGap: 0 });
    doc.font('Helvetica').fontSize(8.75).text(value, { width, continued: false, lineGap: 0 });
    y = doc.y + 1.2;
  }

  function entry(item) {
    y = text(item.title, left, y, { bold: true, size: 8.75 }) + 2;

    if (item.role) {
      y = text(item.role, left, y, { italic: true, size: 8.55 }) + 5;
    }

    item.items.forEach((line) => {
      doc.font('Helvetica').fontSize(8.35).text('-', left + 10, y, { width: 7, continued: false });
      y = text(line, left + 22, y, {
        size: 8.35,
        width: width - 22,
        lineGap: 0,
      }) + 1.1;
    });

    y += 4;
  }

  return new Promise((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    y = text('Viktor Lacerda', left, y, { bold: true, size: 18, align: 'center' }) + 8;
    y = text('Engenheiro de Software', left, y, { size: 10.2, align: 'center' }) + 4;
    y = text(
      'Brasília - DF | (61) 92000-1340 | viktorlacerda@gmail.com | linkedin.com/in/viktor-lacerda-148310127 | github.com/vla2005',
      left,
      y,
      { size: 8.25, align: 'center', lineGap: 0 }
    ) + 14;

    section('Resumo Profissional');
    paragraph(extractResumeSummary(content));

    section('Competências');
    skill('Linguagens e Frameworks', 'PHP (Laravel), Java (Spring Boot), JavaScript/TypeScript, Node.js, React, Vue.js, HTML, CSS, Tailwind CSS');
    skill('Back-end e APIs', 'REST APIs, integrações com IA, OpenAPI/Swagger, JWT, OAuth, Keycloak, Laravel Sanctum, Queues, RabbitMQ, Jobs, WebSocket, Postman');
    skill('Infraestrutura e Ferramentas', 'AWS (EC2, S3, Systems Manager), Oracle Cloud (OCI), Docker, Nginx, PM2, GitHub Actions, CI/CD, OIDC, cron jobs, Git, GitHub, SQL Server, PostgreSQL, MySQL');
    skill('Testes e Metodologias', 'JUnit, PHPUnit, Clean Architecture, Clean Code, SOLID, Scrum, Kanban');
    skill('Idiomas', 'Português nativo, Inglês C1, Espanhol C2');

    section('Experiência Profissional');
    CLEAN_EXPERIENCES.forEach(entry);

    section('Projetos Pessoais / Acadêmicos');
    CLEAN_PROJECTS.forEach(entry);

    section('Educação');
    y = text('Universidade Católica de Brasília - UCB | Brasília - DF', left, y, { bold: true, size: 8.75 }) + 2;
    text('Engenharia de Software | Mar 2023 -- Dez 2026 (Previsão)', left, y, { italic: true, size: 8.55 });

    doc.end();
  });
}
async function buildResumeAttachments(successfulJobs) {
  const jobsWithResume = successfulJobs
    .filter(({ job }) => job.analise_ia && (job.analise_ia.curriculo_personalizado_latex || job.analise_ia.curriculo_personalizado));

  const attachments = [];

  for (const { level, job } of jobsWithResume) {
    const baseName = `curriculo-viktor-${stableText(level)}-${stableText(job.nome_empresa || job.titulo_vaga)}`;
    const resumeContent = job.analise_ia.curriculo_personalizado_latex || job.analise_ia.curriculo_personalizado;

    attachments.push({
      filename: `${baseName}.pdf`,
      content: await buildResumePdfClean(resumeContent),
      contentType: 'application/pdf',
    });

    if (job.analise_ia.curriculo_personalizado_latex) {
      attachments.push({
        filename: `${baseName}.tex`,
        content: job.analise_ia.curriculo_personalizado_latex,
        contentType: 'application/x-tex',
      });
    }
  }

  return attachments;
}

function getEmailFrom() {
  const email = EMAIL_FROM || SMTP_USER;

  if (!EMAIL_FROM_NAME) {
    return email;
  }

  return `"${EMAIL_FROM_NAME}" <${email}>`;
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

function readAnalyzedJobs() {
  try {
    if (!fs.existsSync(ANALYZED_JOBS_FILE)) {
      return {};
    }

    return JSON.parse(fs.readFileSync(ANALYZED_JOBS_FILE, 'utf8'));
  } catch (error) {
    return {};
  }
}

function saveAnalyzedJobs(analyzedJobs) {
  fs.mkdirSync(path.dirname(ANALYZED_JOBS_FILE), { recursive: true });
  fs.writeFileSync(ANALYZED_JOBS_FILE, JSON.stringify(analyzedJobs, null, 2));
}

function removeExpiredAnalyzedJobs(analyzedJobs) {
  const now = Date.now();
  const activeJobs = {};

  Object.entries(analyzedJobs).forEach(([key, value]) => {
    const analyzedAt = value && value.analyzed_at ? new Date(value.analyzed_at).getTime() : 0;

    if (analyzedAt && now - analyzedAt <= ANALYZED_JOBS_TTL) {
      activeJobs[key] = value;
    }
  });

  return activeJobs;
}

function getAnalyzedJob(level, job) {
  const analyzedJobs = removeExpiredAnalyzedJobs(readAnalyzedJobs());
  saveAnalyzedJobs(analyzedJobs);

  const keys = getAlternativeJobKeys(level, job);
  const key = keys.find((item) => analyzedJobs[item]);

  return key ? analyzedJobs[key] : null;
}

function markJobAnalyzed(level, job, analysis) {
  const analyzedJobs = removeExpiredAnalyzedJobs(readAnalyzedJobs());
  const now = new Date().toISOString();
  const keys = getAlternativeJobKeys(level, job);

  keys.forEach((key) => {
    analyzedJobs[key] = {
      analyzed_at: now,
      adequada: Boolean(analysis && analysis.adequada),
      pontuacao_adequacao: Number((analysis && analysis.pontuacao_adequacao) || 0),
      titulo_vaga: job.titulo_vaga,
      link_vaga: job.link_vaga,
    };
  });

  saveAnalyzedJobs(analyzedJobs);
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
  getAnalyzedJob,
  markJobAnalyzed,

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
        reason: 'Nenhuma vaga com boa adequação foi encontrada.',
      };
    }

    const sentJobs = removeExpiredSentJobs(readSentJobs());
    saveSentJobs(sentJobs);
    const jobsToSend = successfulJobs.filter(({ keys }) => !keys.some((key) => sentJobs[key]));

    if (jobsToSend.length === 0) {
      return {
        sent: false,
        reason: 'A vaga encontrada já foi enviada anteriormente.',
      };
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

    const email = buildEmailFromJobs(jobsToSend, results);
    const attachments = await buildResumeAttachments(jobsToSend);

    await transporter.sendMail({
      from: getEmailFrom(),
      to: EMAIL_TO,
      subject: email.subject,
      text: email.text,
      html: email.html,
      attachments,
    });

    if (jobsToSend.length > 0) {
      const sentJobs = readSentJobs();
      const now = new Date().toISOString();

      jobsToSend.forEach(({ keys, job }) => {
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
