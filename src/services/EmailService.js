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
    const missingDependency = new Error('Instale a dependencia nodemailer com npm install no cPanel.');
    missingDependency.statusCode = 500;
    throw missingDependency;
  }
}

function getPdfKit() {
  try {
    return require('pdfkit');
  } catch (error) {
    const missingDependency = new Error('Instale a dependencia pdfkit com npm install no cPanel.');
    missingDependency.statusCode = 500;
    throw missingDependency;
  }
}

function buildJobText(level, job) {
  const analysis = job.analise_ia || {};

  return `
Nova vaga ${level}

TÃƒÆ’Ã‚Â­tulo: ${job.titulo_vaga || ''}
Empresa: ${job.nome_empresa || ''}
Local: ${job.local || ''}
Modelo: ${job.forma_trabalho || ''}
NÃƒÆ’Ã‚Â­vel: ${job.nivel || job.nivel_vaga || ''}
Link: ${job.link_vaga || ''}

Resumo da IA:
${analysis.resumo || ''}

Motivo:
${analysis.motivo || ''}

Pontos fortes:
${(analysis.pontos_fortes || []).join('\n')}

Pontos de atenÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o:
${(analysis.pontos_atencao || []).join('\n')}

SugestÃƒÆ’Ã‚Â£o de preparaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o:
${analysis.sugestao_preparacao || ''}

Tecnologias:
${(job.tecnologias || []).join(', ')}

DescriÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o:
${job.descricao_vaga || ''}

Requisitos:
${job.requisitos_tecnicos || ''}
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

function buildList(items) {
  const listItems = (items || []).filter(Boolean);

  if (listItems.length === 0) {
    return '<p style="margin:0;color:#6b7280;font-size:10.5px;line-height:1.25;">Não informado.</p>';
  }

  return `
    <ul style="margin:4px 0 0 0;padding:0 0 0 13px;color:#111827;font-size:10.5px;line-height:1.28;">
      ${listItems.map((item) => `<li style="margin:2px 0;">${escapeHtml(item)}</li>`).join('')}
    </ul>
  `;
}

function buildTagList(items) {
  const tags = (items || []).filter(Boolean);

  if (tags.length === 0) {
    return '<span style="color:#6b7280;font-size:10.5px;">Não informado</span>';
  }

  return tags
    .slice(0, 18)
    .map((item) => `<span style="display:inline-block;margin:0 3px 4px 0;padding:3px 6px;border-radius:999px;background:#eef2ff;color:#3730a3;font-size:9.5px;line-height:1.1;">${escapeHtml(item)}</span>`)
    .join('');
}

function buildCompactInfoCell(label, value) {
  return `
    <td style="width:25%;padding:0 8px 6px 0;vertical-align:top;">
      <div style="color:#6b7280;font-size:9.5px;line-height:1.15;">${label}</div>
      <div style="color:#111827;font-size:10.5px;line-height:1.2;font-weight:700;">${escapeHtml(value || 'Não informado')}</div>
    </td>
  `;
}

function buildCompactPanel(title, body, options = {}) {
  const background = options.background || '#ffffff';
  const border = options.border || '#e5e7eb';
  const titleColor = options.titleColor || '#111827';
  const textColor = options.textColor || '#374151';

  return `
    <div style="padding:9px 10px;background:${background};border:1px solid ${border};border-radius:7px;margin-bottom:8px;">
      <h2 style="margin:0 0 4px 0;font-size:12px;line-height:1.2;color:${titleColor};">${title}</h2>
      <p style="margin:0;color:${textColor};font-size:10.5px;line-height:1.32;">${escapeHtml(body || 'Não informado.')}</p>
    </div>
  `;
}

function buildJobHtml(level, job) {
  const analysis = job.analise_ia || {};
  const score = analysis.pontuacao_adequacao || 0;
  const link = job.link_vaga || '';

  return `
    <div style="max-width:680px;margin:0 auto 12px auto;background:#ffffff;border:1px solid #dbe1ea;border-radius:8px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#111827;">
      <div style="padding:11px 14px;background:#111827;color:#ffffff;">
        <table role="presentation" style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="vertical-align:top;padding:0;">
              <div style="font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#c7d2fe;line-height:1.1;">Nova vaga ${escapeHtml(level)}</div>
              <h1 style="margin:4px 0 2px 0;font-size:15px;line-height:1.18;color:#ffffff;">${escapeHtml(job.titulo_vaga || 'Vaga encontrada')}</h1>
              <p style="margin:0;color:#d1d5db;font-size:10.5px;line-height:1.2;">${escapeHtml(job.nome_empresa || 'Empresa não informada')}</p>
            </td>
            <td style="width:78px;text-align:right;vertical-align:middle;padding:0;">
              ${link ? `<a href="${escapeHtml(link)}" style="display:inline-block;padding:6px 8px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:5px;font-size:10px;font-weight:700;">Abrir vaga</a>` : ''}
            </td>
          </tr>
        </table>
      </div>

      <div style="padding:10px 14px 12px 14px;">
        <table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:5px;">
          <tr>
            ${buildCompactInfoCell('Local', job.local)}
            ${buildCompactInfoCell('Modelo', job.forma_trabalho)}
            ${buildCompactInfoCell('Nível', job.nivel || job.nivel_vaga)}
            ${buildCompactInfoCell('Aderência', `${score}/100`)}
          </tr>
        </table>

        ${buildCompactPanel('Resumo da IA', analysis.resumo, { background: '#f9fafb', border: '#e5e7eb' })}
        ${buildCompactPanel('Por que combina', analysis.motivo, { background: '#ecfdf3', border: '#86efac', titleColor: '#166534', textColor: '#14532d' })}

        <table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:8px;">
          <tr>
            <td style="width:50%;vertical-align:top;padding:0 4px 0 0;">
              <div style="padding:8px 9px;border:1px solid #e5e7eb;border-radius:7px;">
                <h2 style="margin:0;font-size:12px;line-height:1.2;color:#111827;">Pontos fortes</h2>
                ${buildList(analysis.pontos_fortes)}
              </div>
            </td>
            <td style="width:50%;vertical-align:top;padding:0 0 0 4px;">
              <div style="padding:8px 9px;border:1px solid #e5e7eb;border-radius:7px;">
                <h2 style="margin:0;font-size:12px;line-height:1.2;color:#111827;">Pontos de atenção</h2>
                ${buildList(analysis.pontos_atencao)}
              </div>
            </td>
          </tr>
        </table>

        ${buildCompactPanel('Sugestão de preparação', analysis.sugestao_preparacao)}

        <div style="margin-bottom:7px;">
          <h2 style="margin:0 0 5px 0;font-size:12px;line-height:1.2;color:#111827;">Tecnologias</h2>
          ${buildTagList(job.tecnologias)}
        </div>

        <table role="presentation" style="width:100%;border-collapse:collapse;border-top:1px solid #e5e7eb;padding-top:8px;">
          <tr>
            <td style="width:50%;vertical-align:top;padding:8px 6px 0 0;">
              <h2 style="margin:0 0 4px 0;font-size:12px;line-height:1.2;color:#111827;">Descrição</h2>
              <p style="margin:0;color:#374151;font-size:10px;line-height:1.28;">${escapeHtml(job.descricao_vaga || 'Não informado.')}</p>
            </td>
            <td style="width:50%;vertical-align:top;padding:8px 0 0 6px;">
              <h2 style="margin:0 0 4px 0;font-size:12px;line-height:1.2;color:#111827;">Requisitos</h2>
              <p style="margin:0;color:#374151;font-size:10px;line-height:1.28;">${escapeHtml(job.requisitos_tecnicos || 'Não informado.')}</p>
            </td>
          </tr>
        </table>
      </div>
    </div>
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
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:0 auto;padding:24px;">
          <h1 style="font-size:20px;color:#111827;">Nenhuma vaga adequada foi encontrada</h1>
          <pre style="white-space:pre-wrap;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px;color:#374151;">${escapeHtml(JSON.stringify(results, null, 2))}</pre>
        </div>
      `,
    };
  }

  return {
    subject: `Nova vaga adequada: ${successfulJobs[0].job.titulo_vaga || successfulJobs[0].level}`,
    text: successfulJobs
      .map(({ level, job }) => buildJobText(level, job))
      .join('\n\n---\n\n'),
    html: `
      <div style="margin:0;padding:10px;background:#f3f4f6;">
        ${successfulJobs.map(({ level, job }) => buildJobHtml(level, job)).join('')}
        <p style="max-width:680px;margin:0 auto;color:#6b7280;font-family:Arial,Helvetica,sans-serif;font-size:10px;text-align:center;">
          Email gerado automaticamente pela automaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o de vagas.
        </p>
      </div>
    `,
  };
}

const RESUME_PAGE = {
  width: 595.28,
  height: 935.43,
  margin: 28.35,
};

function fixEncoding(value) {
  return String(value || '')
    .replace(/ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡/g, 'ÃƒÆ’Ã‚Â¡')
    .replace(/ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ /g, 'ÃƒÆ’Ã‚Â ')
    .replace(/ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢/g, 'ÃƒÆ’Ã‚Â¢')
    .replace(/ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£/g, 'ÃƒÆ’Ã‚Â£')
    .replace(/ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©/g, 'ÃƒÆ’Ã‚Â©')
    .replace(/ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âª/g, 'ÃƒÆ’Ã‚Âª')
    .replace(/ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­/g, 'ÃƒÆ’Ã‚Â­')
    .replace(/ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³/g, 'ÃƒÆ’Ã‚Â³')
    .replace(/ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â´/g, 'ÃƒÆ’Ã‚Â´')
    .replace(/ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµ/g, 'ÃƒÆ’Ã‚Âµ')
    .replace(/ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âº/g, 'ÃƒÆ’Ã‚Âº')
    .replace(/ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§/g, 'ÃƒÆ’Ã‚Â§')
    .replace(/ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â/g, 'ÃƒÆ’Ã‚Â')
    .replace(/ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â°/g, 'ÃƒÆ’Ã¢â‚¬Â°')
    .replace(/ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¡/g, 'ÃƒÆ’Ã¢â‚¬Â¡')
    .replace(/ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“|ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â/g, '-')
    .replace(/ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢/g, 'ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢')
    .replace(/ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡/g, 'ÃƒÆ’Ã‚Â¡')
    .replace(/ÃƒÆ’Ã†â€™ /g, 'ÃƒÆ’Ã‚Â ')
    .replace(/ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢/g, 'ÃƒÆ’Ã‚Â¢')
    .replace(/ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£/g, 'ÃƒÆ’Ã‚Â£')
    .replace(/ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©/g, 'ÃƒÆ’Ã‚Â©')
    .replace(/ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Âª/g, 'ÃƒÆ’Ã‚Âª')
    .replace(/ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â­/g, 'ÃƒÆ’Ã‚Â­')
    .replace(/ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â³/g, 'ÃƒÆ’Ã‚Â³')
    .replace(/ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â´/g, 'ÃƒÆ’Ã‚Â´')
    .replace(/ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Âµ/g, 'ÃƒÆ’Ã‚Âµ')
    .replace(/ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Âº/g, 'ÃƒÆ’Ã‚Âº')
    .replace(/ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§/g, 'ÃƒÆ’Ã‚Â§')
    .replace(/ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â/g, 'ÃƒÆ’Ã‚Â')
    .replace(/ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â°/g, 'ÃƒÆ’Ã¢â‚¬Â°')
    .replace(/ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¡/g, 'ÃƒÆ’Ã¢â‚¬Â¡')
    .replace(/ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ|ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â/g, '-')
    .replace(/ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢/g, 'ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢');
}

function cleanLatexText(value) {
  return fixEncoding(value)
    .replace(/%.*$/gm, '')
    .replace(/\\href\{[^}]+\}\{([^}]+)\}/g, '$1')
    .replace(/\\textbf\{([^{}]+)\}/g, '$1')
    .replace(/\\textit\{([^{}]+)\}/g, '$1')
    .replace(/\\textbullet/g, 'ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢')
    .replace(/\\hfill/g, ' | ')
    .replace(/\\\\(?:\[[^\]]+\])?/g, '\n')
    .replace(/\\[a-zA-Z]+(?:\[[^\]]*\])?(?:\{[^}]*\})?/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+\|/g, ' |')
    .replace(/\|\s+/g, '| ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function extractLatexSection(content, sectionName) {
  const source = fixEncoding(content);
  const escapedName = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sectionRegex = new RegExp(`\\\\section\\{${escapedName}\\}([\\s\\S]*?)(?=\\\\section\\{|\\\\end\\{document\\}|$)`, 'i');
  const match = source.match(sectionRegex);
  return match ? match[1].trim() : '';
}

function parseInlineSection(sectionContent) {
  return [
    'Linguagens e Frameworks: PHP (Laravel), Java (Spring Boot), JavaScript/TypeScript, Node.js, React, Vue.js',
    'Back-end e APIs: REST APIs, integraÃ§Ãµes com IA, OpenAPI/Swagger, JWT, Queues, Jobs, WebSocket, Postman',
    'Infraestrutura e Ferramentas: Docker, CI/CD, Git, GitHub, SQL Server, PostgreSQL, MySQL',
    'Ferramentas e Metodologias: Clean Code, SOLID, Scrum, Kanban',
    'Idiomas: PortuguÃªs nativo, InglÃªs C1, Espanhol C2',
  ];
}

function parseEntries(sectionContent) {
  const entries = [];
  const source = String(sectionContent || '');
  const marker = '\\subsection*{';
  let cursor = 0;

  while (cursor < source.length) {
    const markerIndex = source.indexOf(marker, cursor);

    if (markerIndex === -1) {
      break;
    }

    let index = markerIndex + marker.length;
    let depth = 1;
    const titleStart = index;

    while (index < source.length && depth > 0) {
      if (source[index] === '{') {
        depth += 1;
      } else if (source[index] === '}') {
        depth -= 1;
      }

      index += 1;
    }

    const title = cleanLatexText(source.slice(titleStart, index - 1));
    const nextMarkerIndex = source.indexOf(marker, index);
    const body = source.slice(index, nextMarkerIndex === -1 ? source.length : nextMarkerIndex);
    const italicMatch = body.match(/\\textit\{([\s\S]*?)\}/);
    const role = italicMatch ? cleanLatexText(italicMatch[1]) : '';
    const itemMatches = [...body.matchAll(/\\item\s+([\s\S]*?)(?=\\item|\\end\{itemize\}|$)/g)];
    const items = itemMatches.map((item) => cleanLatexText(item[1])).filter(Boolean);

    entries.push({ title, role, items });
    cursor = nextMarkerIndex === -1 ? source.length : nextMarkerIndex;
  }

  return entries;
}

const TEMPLATE_EXPERIENCE = [
  {
    title: 'SERVIÃ‡O FEDERAL DE PROCESSAMENTO DE DADOS - SERPRO | BrasÃ­lia - DF',
    role: 'Engenheiro de Software JÃºnior | Abril 2024 -- Abril 2026',
    items: [
      'Desenvolvimento e manutenÃ§Ã£o de APIs REST com Java (Spring Boot) e PHP (Laravel).',
      'Desenvolvimento e manutenÃ§Ã£o de interfaces com React e Vue.js.',
      'ManutenÃ§Ã£o de banco de dados relacional e melhoria do fluxo de entrega.',
      'RealizaÃ§Ã£o de testes com JUnit, PHPUnit e anÃ¡lise de requisitos.',
    ],
  },
  {
    title: 'Freelance - Landing Page Disk Baterias DF | BrasÃ­lia, DF - Mai 2026',
    role: '',
    items: [
      'Desenvolvimento com React e Tailwind CSS | layout mobile-first.',
      'https://diskbaterias22hs.com',
    ],
  },
  {
    title: 'Freelance Full Stack - Sistema de GestÃ£o de Oficina MecÃ¢nica | BrasÃ­lia, DF - Nov 2025',
    role: '',
    items: [
      'Desenvolvimento full stack com Laravel, Vue.js e Tailwind CSS.',
      'GestÃ£o de clientes, serviÃ§os, controle financeiro e dashboard interativo.',
      'AutenticaÃ§Ã£o com Laravel Sanctum | 2FA com Google Authenticator | Filas (Laravel Queues).',
    ],
  },
  {
    title: 'Freelance - Landing Page ONG de AdoÃ§Ã£o de Animais | BrasÃ­lia, DF - Ago 2025',
    role: '',
    items: [
      'Desenvolvimento com React e Tailwind CSS | layout mobile-first.',
      'https://www.projetoadotar.site',
    ],
  },
];

const TEMPLATE_PROJECTS = [
  {
    title: 'NutriTreino - Sistema de GestÃ£o Nutricional e Treinos | Mar - Mai 2026',
    role: '',
    items: [
      'Desenvolvimento full stack com Laravel, React.js, Vite e CSS responsivo.',
      'GestÃ£o de pacientes/alunos, planos alimentares, programas de treino, progresso corporal, fotos de evoluÃ§Ã£o, check-ins semanais, chat em tempo real, chamada de vÃ­deo com WebRTC e dashboard interativo.',
      'IntegraÃ§Ã£o com IA Gemini para geraÃ§Ã£o e ajuste de rascunhos de dietas e treinos com base em objetivos, preferÃªncias, limitaÃ§Ãµes e dados fÃ­sicos do paciente.',
      'AutenticaÃ§Ã£o com Laravel Sanctum; Filas (Queues); Upload de arquivos; NotificaÃ§Ãµes por e-mail; Pusher para eventos em tempo real.',
    ],
  },
  {
    title: 'AutomaÃ§Ã£o Inteligente de Busca de Vagas | Mai 2026',
    role: '',
    items: [
      'Desenvolvido em Node.js com integraÃ§Ã£o Ã  IA Gemini.',
      'Utiliza inteligÃªncia artificial para analisar e comparar os requisitos das vagas com o currÃ­culo do candidato, identificando oportunidades com maior aderÃªncia ao perfil.',
      'Envia notificaÃ§Ãµes por e-mail contendo a avaliaÃ§Ã£o da compatibilidade e o link direto para candidatura.',
    ],
  },
  {
    title: 'AutomaÃ§Ã£o de Ofertas com Shopee Afiliados e Telegram | Jun 2026',
    role: '',
    items: [
      'Desenvolvido em Java com Spring Boot, Maven, Docker e arquitetura em camadas.',
      'Integra-se Ã  API GraphQL de Afiliados da Shopee para buscar produtos em promoÃ§Ã£o periodicamente.',
      'Envia automaticamente ofertas para um grupo do Telegram.',
      'https://t.me/viktorwareofertas',
    ],
  },
];

const TEMPLATE_EDUCATION = [
  {
    title: 'Universidade CatÃ³lica de BrasÃ­lia - UCB | BrasÃ­lia - DF',
    role: 'Engenharia de Software | Mar 2023 -- Dez 2026 (PrevisÃ£o)',
    items: [],
  },
];

function getResumeData(content) {
  return {
    summary: cleanLatexText(extractLatexSection(content, 'Resumo Profissional')),
    skills: parseInlineSection(extractLatexSection(content, 'CompetÃªncias')),
    experience: TEMPLATE_EXPERIENCE,
    projects: TEMPLATE_PROJECTS,
    education: TEMPLATE_EDUCATION,
  };
}
function ensureSpace(doc, y, neededHeight) {
  if (y + neededHeight <= RESUME_PAGE.height - RESUME_PAGE.margin) {
    return y;
  }

  doc.addPage();
  return RESUME_PAGE.margin;
}

function drawText(doc, text, x, y, options = {}) {
  const safeText = fixEncoding(text);
  const width = options.width || RESUME_PAGE.width - (RESUME_PAGE.margin * 2);
  const fontSize = options.fontSize || 9.2;
  const lineGap = options.lineGap || 1.2;
  const font = options.bold ? 'Helvetica-Bold' : options.italic ? 'Helvetica-Oblique' : 'Helvetica';

  doc.font(font).fontSize(fontSize);
  doc.text(safeText, x, y, {
    width,
    align: options.align || 'left',
    lineGap,
    continued: false,
  });

  return doc.y;
}

function drawSectionTitle(doc, title, y) {
  const safeTitle = fixEncoding(title);
  y = ensureSpace(doc, y, 34);
  y += 10;
  doc.font('Helvetica-Bold').fontSize(11.4).text(safeTitle, RESUME_PAGE.margin, y);
  y = doc.y + 3;
  doc
    .moveTo(RESUME_PAGE.margin, y)
    .lineTo(RESUME_PAGE.width - RESUME_PAGE.margin, y)
    .lineWidth(0.45)
    .strokeColor('#111111')
    .stroke();
  return y + 8;
}

function drawParagraph(doc, text, y) {
  y = ensureSpace(doc, y, 42);
  return drawText(doc, text, RESUME_PAGE.margin, y, {
    fontSize: 9.35,
    lineGap: 1.45,
  }) + 2;
}

function drawSkillLines(doc, lines, y) {
  for (const rawLine of lines) {
    const line = fixEncoding(rawLine);
    y = ensureSpace(doc, y, 16);

    const labelMatch = line.match(/^([^:]+):(.*)$/);

    if (!labelMatch) {
      y = drawText(doc, line, RESUME_PAGE.margin, y, {
        fontSize: 9.15,
        lineGap: 1.1,
      }) + 2;
      continue;
    }

    const label = `${labelMatch[1]}:`;
    const value = (labelMatch[2] || '').trim();
    const lineWidth = RESUME_PAGE.width - (RESUME_PAGE.margin * 2);

    doc.font('Helvetica-Bold').fontSize(9.15);
    doc.text(`${label} `, RESUME_PAGE.margin, y, {
      width: lineWidth,
      continued: true,
      lineGap: 1.1,
    });

    doc.font('Helvetica').fontSize(9.15);
    doc.text(value, {
      width: lineWidth,
      continued: false,
      lineGap: 1.1,
    });

    y = doc.y + 2;
  }

  return y;
}
function drawEntry(doc, entry, y) {
  y = ensureSpace(doc, y, 54);
  y = drawText(doc, entry.title, RESUME_PAGE.margin, y, {
    fontSize: 9.35,
    bold: true,
    lineGap: 1,
  }) + 4;

  if (entry.role) {
    y = drawText(doc, entry.role, RESUME_PAGE.margin, y, {
      fontSize: 9.1,
      italic: true,
      lineGap: 1,
    }) + 8;
  }

  for (const item of entry.items) {
    y = ensureSpace(doc, y, 24);
    doc.font('Helvetica').fontSize(9.1).text('Ã¢â‚¬Â¢', RESUME_PAGE.margin + 10, y, {
      width: 8,
      continued: false,
    });
    y = drawText(doc, item, RESUME_PAGE.margin + 23, y, {
      width: RESUME_PAGE.width - (RESUME_PAGE.margin * 2) - 23,
      fontSize: 9.1,
      lineGap: 1.15,
    }) + 2;
  }

  return y + 8;
}

function buildResumePdf(content) {
  const PDFDocument = getPdfKit();
  const doc = new PDFDocument({
    margin: RESUME_PAGE.margin,
    size: [RESUME_PAGE.width, RESUME_PAGE.height],
  });

  const chunks = [];

  return new Promise((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const resume = getResumeData(content);
    let y = RESUME_PAGE.margin + 3;

    y = drawText(doc, 'Viktor Lacerda', RESUME_PAGE.margin, y, {
      fontSize: 17.2,
      bold: true,
      align: 'center',
      lineGap: 0,
    }) + 9;

    y = drawText(doc, 'Engenheiro de Software', RESUME_PAGE.margin, y, {
      fontSize: 9.8,
      align: 'center',
      lineGap: 0,
    }) + 5;

    y = drawText(
      doc,
      'BrasÃƒÂ­lia - DF Ã¢â‚¬Â¢ (61) 92000-1340 Ã¢â‚¬Â¢ viktorlacerda@gmail.com Ã¢â‚¬Â¢ linkedin.com/in/viktor-lacerda-148310127 Ã¢â‚¬Â¢ github.com/vla2005',
      RESUME_PAGE.margin,
      y,
      {
        fontSize: 8.9,
        align: 'center',
        lineGap: 0,
      }
    ) + 18;

    y = drawSectionTitle(doc, 'Resumo Profissional', y);
    y = drawParagraph(doc, resume.summary, y);

    y = drawSectionTitle(doc, 'CompetÃƒÂªncias', y);
    y = drawSkillLines(doc, resume.skills, y);

    y = drawSectionTitle(doc, 'ExperiÃƒÂªncia Profissional', y);
    for (const entry of resume.experience) {
      y = drawEntry(doc, entry, y);
    }

    y = drawSectionTitle(doc, 'Projetos Pessoais / AcadÃƒÂªmicos', y);
    for (const entry of resume.projects) {
      y = drawEntry(doc, entry, y);
    }

    if (resume.education.length > 0) {
      y = drawSectionTitle(doc, 'EducaÃƒÂ§ÃƒÂ£o', y);
      for (const entry of resume.education) {
        y = drawEntry(doc, entry, y);
      }
    }

    doc.end();
  });
}

const CLEAN_RESUME_PAGE = {
  width: 595.28,
  height: 935.43,
  margin: 28.35,
};

const CLEAN_EXPERIENCES = [
  {
    title: 'SERVICO FEDERAL DE PROCESSAMENTO DE DADOS - SERPRO | Brasilia - DF',
    role: 'Engenheiro de Software Junior | Abril 2024 -- Abril 2026',
    items: [
      'Desenvolvimento e manutencao de APIs REST com Java (Spring Boot) e PHP (Laravel).',
      'Desenvolvimento e manutencao de interfaces com React e Vue.js.',
      'Manutencao de banco de dados relacional e melhoria do fluxo de entrega.',
      'Realizacao de testes com JUnit, PHPUnit e analise de requisitos.',
    ],
  },
  {
    title: 'Freelance - Landing Page Disk Baterias DF | Brasilia, DF - Mai 2026',
    items: [
      'Desenvolvimento com React e Tailwind CSS | layout mobile-first.',
      'https://diskbaterias22hs.com',
    ],
  },
  {
    title: 'Freelance Full Stack - Sistema de Gestao de Oficina Mecanica | Brasilia, DF - Nov 2025',
    items: [
      'Desenvolvimento full stack com Laravel, Vue.js e Tailwind CSS.',
      'Gestao de clientes, servicos, controle financeiro e dashboard interativo.',
      'Autenticacao com Laravel Sanctum | 2FA com Google Authenticator | Filas (Laravel Queues).',
    ],
  },
  {
    title: 'Freelance - Landing Page ONG de Adocao de Animais | Brasilia, DF - Ago 2025',
    items: [
      'Desenvolvimento com React e Tailwind CSS | layout mobile-first.',
      'https://www.projetoadotar.site',
    ],
  },
];

const CLEAN_PROJECTS = [
  {
    title: 'NutriTreino - Sistema de Gestao Nutricional e Treinos | Mar - Mai 2026',
    items: [
      'Desenvolvimento full stack com Laravel, React.js, Vite e CSS responsivo.',
      'Gestao de pacientes/alunos, planos alimentares, programas de treino, progresso corporal, fotos de evolucao, check-ins semanais, chat em tempo real, chamada de video com WebRTC e dashboard interativo.',
      'Integracao com IA Gemini para geracao e ajuste de rascunhos de dietas e treinos com base em objetivos, preferencias, limitacoes e dados fisicos do paciente.',
      'Autenticacao com Laravel Sanctum; Filas (Queues); Upload de arquivos; Notificacoes por e-mail; Pusher para eventos em tempo real.',
    ],
  },
  {
    title: 'Automacao Inteligente de Busca de Vagas | Mai 2026',
    items: [
      'Desenvolvido em Node.js com integracao a IA Gemini.',
      'Utiliza inteligencia artificial para analisar e comparar os requisitos das vagas com o curriculo do candidato, identificando oportunidades com maior aderencia ao perfil.',
      'Envia notificacoes por e-mail contendo a avaliacao da compatibilidade e o link direto para candidatura.',
    ],
  },
  {
    title: 'Automacao de Ofertas com Shopee Afiliados e Telegram | Jun 2026',
    items: [
      'Desenvolvido em Java com Spring Boot, Maven, Docker e arquitetura em camadas.',
      'Integra-se a API GraphQL de Afiliados da Shopee para buscar produtos em promocao periodicamente.',
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

  if (!summary || /Ã|Â|â/.test(summary)) {
    return 'Engenheiro de Software full stack com 2 anos de experiencia, com foco em Java, PHP, JavaScript e arquitetura escalavel. Experiencia na construcao de APIs REST aplicando Clean Architecture, Clean Code, otimizacoes e SOLID.';
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
      'Brasilia - DF | (61) 92000-1340 | viktorlacerda@gmail.com | linkedin.com/in/viktor-lacerda-148310127 | github.com/vla2005',
      left,
      y,
      { size: 8.25, align: 'center', lineGap: 0 }
    ) + 14;

    section('Resumo Profissional');
    paragraph(extractResumeSummary(content));

    section('Competencias');
    skill('Linguagens e Frameworks', 'PHP (Laravel), Java (Spring Boot), JavaScript/TypeScript, Node.js, React, Vue.js');
    skill('Back-end e APIs', 'REST APIs, integracoes com IA, OpenAPI/Swagger, JWT, Queues, Jobs, WebSocket, Postman');
    skill('Infraestrutura e Ferramentas', 'Docker, CI/CD, Git, GitHub, SQL Server, PostgreSQL, MySQL');
    skill('Ferramentas e Metodologias', 'Clean Code, SOLID, Scrum, Kanban');
    skill('Idiomas', 'Portugues nativo, Ingles C1, Espanhol C2');

    section('Experiencia Profissional');
    CLEAN_EXPERIENCES.forEach(entry);

    section('Projetos Pessoais / Academicos');
    CLEAN_PROJECTS.forEach(entry);

    section('Educacao');
    y = text('Universidade Catolica de Brasilia - UCB | Brasilia - DF', left, y, { bold: true, size: 8.75 }) + 2;
    text('Engenharia de Software | Mar 2023 -- Dez 2026 (Previsao)', left, y, { italic: true, size: 8.55 });

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
    const attachments = await buildResumeAttachments(successfulJobs);

    await transporter.sendMail({
      from: getEmailFrom(),
      to: EMAIL_TO,
      subject: email.subject,
      text: email.text,
      html: email.html,
      attachments,
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


