const axios = require('axios');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''; // Coloque sua chave do Gemini aqui ou no ambiente
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-2.5-flash';

const api = axios.create({
  baseURL: 'https://generativelanguage.googleapis.com/v1beta',
  proxy: false,
  headers: {
    'Content-Type': 'application/json',
  },
});

const CURRICULO = `
Viktor Lacerda de Araujo - Engenheiro de Software / Desenvolvedor Full Stack, localizado em Brasilia - DF.

Resumo:
Engenheiro de Software full stack com 2 anos de experiencia, foco em Java, PHP, JavaScript e arquitetura escalavel. Experiencia na construcao e manutencao de APIs REST aplicando Clean Architecture, Clean Code, SOLID, otimizacoes e integracoes com IA.

Competencias tecnicas:
- Linguagens e frameworks: PHP, Laravel, Java, Spring Boot, JavaScript, TypeScript, Node.js, React, Vue.js, HTML5, CSS3, Tailwind CSS, PrimeVue, Vuetify, Quasar, PrimeReact
- Banco de dados: SQL Server, PostgreSQL, MySQL, SQL e modelagem relacional
- APIs e integracoes: REST APIs, JWT, filas/queues, jobs, WebSocket, WebRTC, Postman, OpenAPI/Swagger, integracoes com IA Gemini
- DevOps e ferramentas: Docker, CI/CD, Git, GitHub
- Testes: PHPUnit e JUnit
- Metodologias e arquitetura: Scrum, Kanban, Clean Code, Clean Architecture, SOLID

Experiencia:
- SERPRO, Engenheiro de Software Junior, abr/2024 a abr/2026: desenvolvimento e manutencao de APIs REST com Java/Spring Boot e PHP/Laravel; interfaces com React e Vue.js; manutencao de banco relacional; melhoria de fluxo de entrega; testes com JUnit/PHPUnit e analise de requisitos.
- Freelance Landing Page Disk Baterias DF, mai/2026: React e Tailwind CSS com layout mobile-first.
- Freelance Full Stack Sistema de Gestao de Oficina Mecanica, nov/2025: Laravel, Vue.js, Tailwind CSS, Laravel Sanctum, 2FA com Google Authenticator, filas, gestao de clientes, servicos, financeiro e dashboard.
- Freelance Landing Page ONG de Adocao de Animais, ago/2025: React e Tailwind CSS com layout mobile-first.
- Projeto Sistema de Gestao de Barbearia, ago/2025: Laravel, Vue.js, Tailwind CSS, Laravel Sanctum, filas, Inertia.js, dashboard e controle financeiro.
- Projeto NutriTreino, mai/2026: Laravel, React.js, Vite, CSS responsivo, chat em tempo real, chamada de video com WebRTC, IA Gemini para dietas/treinos, filas, uploads, notificacoes por email e Pusher.
- Projeto Automacao Inteligente de Busca de Vagas, mai/2026: Node.js com integracao Gemini para comparar vagas com curriculo e enviar notificacoes por email.
- Projeto Automacao de Ofertas com Shopee Afiliados e Telegram, jun/2026: Java com Spring Boot, Maven, Docker e arquitetura em camadas; integracao com API GraphQL de Afiliados da Shopee; envio automatico de ofertas para grupo do Telegram.

Formacao:
- Engenharia de Software, Universidade Catolica de Brasilia, mar/2023 a dez/2026 (previsao).

Idiomas:
- Portugues nativo
- Ingles avancado C1
- Espanhol C2
`;

const CURRICULO_LATEX_TEMPLATE = `
\\documentclass[a4paper,10pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[brazil]{babel}
\\usepackage[scaled]{helvet}
\\renewcommand{\\familydefault}{\\sfdefault}
\\usepackage[
  paperwidth=210mm,
  paperheight=330mm,
  top=1cm,
  bottom=1cm,
  left=1cm,
  right=1cm
]{geometry}
\\usepackage{parskip}
\\usepackage{hyperref}
\\usepackage{titlesec}
\\usepackage{enumitem}
\\pagestyle{empty}
\\hypersetup{
    pdftitle={CV Viktor Lacerda},
    pdfauthor={Viktor Lacerda},
    colorlinks=true,
    urlcolor=black
}
\\setcounter{secnumdepth}{0}
\\titleformat{\\section}
{\\large\\bfseries}
{}
{0em}
{}
[\\titlerule\\vspace{0.3ex}]
\\setlist[itemize]{noitemsep, topsep=2pt}
\\begin{document}
\\small
\\begin{center}
    {\\LARGE \\textbf{Viktor Lacerda}} \\\\[0.15cm]
    Engenheiro de Software \\\\[0.05cm]
    Brasilia -- DF \\textbullet\\ (61) 92000-1340 \\textbullet\\
    \\href{mailto:viktorlacerda@gmail.com}{viktorlacerda@gmail.com} \\textbullet\\
    \\href{https://linkedin.com/in/viktor-lacerda-148310127}{linkedin.com/in/viktor-lacerda-148310127} \\textbullet\\
    \\href{https://github.com/vla2005}{github.com/vla2005}
\\end{center}
\\section{Resumo Profissional}
RESUMO_PROFISSIONAL
\\section{Competencias}
COMPETENCIAS
\\section{Experiencia Profissional}
EXPERIENCIA_PROFISSIONAL
\\section{Projetos Pessoais / Academicos}
PROJETOS
\\section{Educacao}
\\subsection*{\\textbf{Universidade Catolica de Brasilia - UCB} \\hfill Brasilia - DF}
\\textit{Engenharia de Software \\hfill Mar 2023 -- Dez 2026 (Previsao)}
\\end{document}
`;

function buildPrompt(vaga) {
  return `
Voce e um consultor de carreira extremamente criterioso especializado em perfis Full Stack Java/PHP.

CURRICULO BASE DO CANDIDATO:
${CURRICULO}

TEMPLATE LATEX OBRIGATORIO:
Use exatamente esta estrutura, substituindo apenas os blocos RESUMO_PROFISSIONAL, COMPETENCIAS, EXPERIENCIA_PROFISSIONAL e PROJETOS.
${CURRICULO_LATEX_TEMPLATE}

TAREFA:
Analise a vaga e gere uma avaliacao de aderencia mais um curriculo personalizado em LaTeX.

PASSO A PASSO OBRIGATORIO:
1. Identifique tecnologias principais, senioridade, modelo de trabalho e localidade da vaga.
2. Compare com o curriculo do candidato usando apenas stack real, experiencia real e localizacao real.
3. Decida se a vaga e adequada de acordo com as regras abaixo.
4. Gere um curriculo personalizado otimizado para a vaga.

REGRAS RIGIDAS DE ADEQUACAO:
1. Retorne "adequada": true somente se "pontuacao_adequacao" for 75 ou maior.
2. Vagas remotas podem ser de qualquer lugar do Brasil.
3. Vagas presenciais ou hibridas somente podem ser adequadas se forem de Brasilia-DF ou Distrito Federal.
4. As tecnologias principais da vaga devem estar no curriculo do candidato.
5. Vagas junior podem ser adequadas se houver boa aderencia tecnica.
6. Vagas pleno so devem ser adequadas se nao exigirem autonomia/senioridade acima do perfil de alguem com 2 anos de experiencia e projetos full stack.
7. Tecnologias fora do foco atual devem reduzir muito a pontuacao e normalmente reprovar a vaga, por exemplo: Angular, .NET, C#, Ruby, Python como stack principal, Go, mobile nativo, Flutter, React Native, DevOps/SRE como foco principal, cloud pesada, dados, BI, RPA, QA como foco principal, suporte e infraestrutura.
8. Se a vaga exigir senioridade muito acima do perfil, tecnologias muito distantes do curriculo ou localidade incompativel, retorne "adequada": false.

TECNOLOGIAS QUE O CANDIDATO DOMINA:
PHP, Laravel, Java, Spring Boot, JavaScript, TypeScript, Node.js, HTML, CSS, Vue.js, PrimeVue, Vuetify, Quasar, React, PrimeReact, Tailwind CSS, SQL Server, MySQL, PostgreSQL, SQL, Git, GitHub, Docker, CI/CD, Postman, REST APIs, JWT, filas/queues, WebSocket, WebRTC, PHPUnit e JUnit.

REGRAS DO CURRICULO PERSONALIZADO:
1. Use apenas informacoes reais do curriculo base. Nao invente experiencias, empresas, formacao, certificacoes, cargos, datas, links ou tecnologias.
2. Mantenha experiencias profissionais, projetos pessoais/academicos e educacao com os mesmos cargos, empresas, datas, links e fatos reais.
3. Reordene, resuma e destaque experiencias e projetos priorizando o que mais combina com a vaga.
4. Use palavras-chave da vaga somente quando forem verdadeiras para o candidato.
5. O Resumo Profissional deve ser forte, objetivo e adaptado para a vaga.
6. Em Competencias, organize os topicos em: Linguagens e Frameworks, Back-end e APIs, Front-end, Banco de Dados e Infraestrutura, Metodologias e Ferramentas, Idiomas.
7. Idiomas: Portugues nativo, Ingles C1 e Espanhol C2.
8. O campo "curriculo_personalizado_latex" deve conter um documento LaTeX completo, iniciando com "\\documentclass" e terminando com "\\end{document}".

RESPOSTA:
Responda exclusivamente com JSON valido, sem markdown fora dos campos JSON e sem texto fora do JSON.

Formato obrigatorio:
{
  "adequada": true,
  "pontuacao_adequacao": 88,
  "motivo": "Frase curta e clara justificando a decisao",
  "resumo": "Resumo objetivo da vaga em ate 2 linhas",
  "pontos_fortes": ["item 1", "item 2", "item 3"],
  "pontos_atencao": ["item 1", "item 2"],
  "sugestao_preparacao": "Sugestao pratica e direta",
  "curriculo_personalizado_latex": "\\\\documentclass[a4paper,10pt]{article}\\n...\\n\\\\end{document}"
}

Vaga para analise:
${JSON.stringify(vaga, null, 2)}
`;
}

function parseAnalysis(outputText) {
  const cleanOutput = String(outputText || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(cleanOutput);
  } catch (error) {
    console.error('Erro ao parsear JSON do Gemini:', error.message);
    return {
      adequada: false,
      pontuacao_adequacao: 0,
      motivo: 'Gemini nao retornou JSON valido.',
      resumo: cleanOutput.substring(0, 300),
      pontos_fortes: [],
      pontos_atencao: ['Falha na formatacao da resposta da IA.'],
      sugestao_preparacao: 'Tente novamente ou analise manualmente.',
      curriculo_personalizado_latex: '',
    };
  }
}

function getGeminiText(data) {
  return data
    && data.candidates
    && data.candidates[0]
    && data.candidates[0].content
    && data.candidates[0].content.parts
    && data.candidates[0].content.parts[0]
    && data.candidates[0].content.parts[0].text
    ? data.candidates[0].content.parts[0].text
    : '';
}

function buildGeminiError(error) {
  const statusCode = error.response ? error.response.status : 500;
  const apiMessage = error.response && error.response.data && error.response.data.error
    ? error.response.data.error.message
    : error.message;

  const sanitizedError = new Error(apiMessage || 'Erro ao consultar Gemini.');
  sanitizedError.statusCode = statusCode;
  sanitizedError.provider = 'gemini';
  sanitizedError.isTemporary = statusCode === 429
    || statusCode === 503
    || /high demand|try again later|temporar/i.test(apiMessage || '');

  return sanitizedError;
}

module.exports = {
  async analyzeJob(vaga) {
    if (!GEMINI_API_KEY) {
      return {
        adequada: false,
        pontuacao_adequacao: 0,
        motivo: 'Chave do Gemini nao configurada.',
        resumo: '',
        pontos_fortes: [],
        pontos_atencao: ['Configure GEMINI_API_KEY para ativar a analise.'],
        sugestao_preparacao: '',
        curriculo_personalizado_latex: '',
      };
    }

    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: buildPrompt(vaga),
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 8192,
      },
    };

    const requestOptions = {
      headers: {
        'x-goog-api-key': GEMINI_API_KEY,
      },
    };

    try {
      const { data } = await api.post(
        `/models/${GEMINI_MODEL}:generateContent`,
        requestBody,
        requestOptions
      );

      return parseAnalysis(getGeminiText(data));
    } catch (error) {
      const firstError = buildGeminiError(error);

      if (!firstError.isTemporary || !GEMINI_FALLBACK_MODEL || GEMINI_FALLBACK_MODEL === GEMINI_MODEL) {
        throw firstError;
      }

      try {
        const { data } = await api.post(
          `/models/${GEMINI_FALLBACK_MODEL}:generateContent`,
          requestBody,
          requestOptions
        );

        const analysis = parseAnalysis(getGeminiText(data));
        analysis.modelo_usado = GEMINI_FALLBACK_MODEL;
        analysis.modelo_fallback = true;
        return analysis;
      } catch (fallbackError) {
        throw buildGeminiError(fallbackError);
      }
    }
  },
};
