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
- APIs e integracoes: REST APIs, JWT, filas/queues, jobs, WebSocket, WebRTC, Postman e integracoes com IA Gemini
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

Formacao:
- Engenharia de Software, Universidade Catolica de Brasilia, mar/2023 a dez/2026 (previsao).

Idiomas:
- Ingles avancado C1
- Espanhol C2
`;

function buildPrompt(vaga) {
  return `
Voce e um avaliador de vagas para o candidato abaixo.

Curriculo do candidato:
${CURRICULO}

Regras obrigatorias:
1. Avalie se a vaga tem boa aderencia ao curriculo do candidato.
2. Retorne "adequada": true somente se a pontuacao de adequacao for 70 ou maior.
3. Vagas remotas podem ser de qualquer lugar do Brasil.
4. Vagas presenciais ou hibridas somente podem ser consideradas adequadas se forem de Brasilia-DF ou Distrito Federal.
5. Vagas junior podem ser consideradas adequadas se houver boa aderencia tecnica.
6. Vagas pleno so devem ser consideradas adequadas se nao exigirem autonomia/senioridade acima do perfil de alguem com 2 anos de estagio e projetos full stack.
7. Retorne "adequada": false se as tecnologias principais da vaga nao estiverem no curriculo.
8. Tecnologias que o candidato domina: PHP, Laravel, Java, Spring Boot, JavaScript, TypeScript, Node.js, HTML, CSS, Vue.js, PrimeVue, Vuetify, Quasar, React, PrimeReact, Tailwind CSS, SQL Server, MySQL, PostgreSQL, SQL, Git, GitHub, Docker, CI/CD, Postman, REST APIs, JWT, filas/queues, WebSocket, WebRTC, PHPUnit e JUnit.
9. Tecnologias fora do foco atual devem reduzir muito a pontuacao e normalmente reprovar a vaga, por exemplo: Angular, .NET, C#, Ruby, Python como stack principal, Go, mobile nativo, Flutter, React Native, DevOps/SRE como foco principal, cloud pesada, dados, BI, RPA, QA como foco principal, suporte e infraestrutura.
10. Se a vaga exigir senioridade muito acima do perfil, tecnologias muito distantes do curriculo ou localidade incompativel, retorne "adequada": false.
11. Responda somente com JSON valido, sem markdown e sem texto fora do JSON.

Formato obrigatorio:
{
  "adequada": true,
  "pontuacao_adequacao": 85,
  "motivo": "explique em uma frase por que a vaga combina ou nao combina",
  "resumo": "resumo curto da vaga",
  "pontos_fortes": ["item 1", "item 2"],
  "pontos_atencao": ["item 1", "item 2"],
  "sugestao_preparacao": "sugestao objetiva para o candidato"
}

Dados da vaga analisada:
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
    return {
      adequada: false,
      pontuacao_adequacao: 0,
      motivo: 'O Gemini retornou uma analise em formato inesperado.',
      resumo: cleanOutput,
      pontos_fortes: [],
      pontos_atencao: ['Nao foi possivel interpretar a resposta como JSON.'],
      sugestao_preparacao: 'Revise manualmente a vaga antes de se candidatar.',
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
    && data.candidates[0].content.parts[0].text;
}

module.exports = {
  async analyzeJob(vaga) {
    if (!GEMINI_API_KEY) {
      return {
        adequada: false,
        pontuacao_adequacao: 0,
        motivo: 'Configure sua chave do Gemini em src/services/GeminiService.js para filtrar vagas pelo curriculo.',
        resumo: '',
        pontos_fortes: [],
        pontos_atencao: ['A analise por IA ainda nao esta ativa.'],
        sugestao_preparacao: '',
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

function buildGeminiError(error) {
  const statusCode = error.response ? error.response.status : 500;
  const apiMessage = error.response && error.response.data && error.response.data.error
    ? error.response.data.error.message
    : error.message;

  const sanitizedError = new Error(apiMessage || 'Erro ao consultar o Gemini.');
  sanitizedError.statusCode = statusCode;
  sanitizedError.provider = 'gemini';
  sanitizedError.isTemporary = statusCode === 429
    || statusCode === 503
    || /high demand|try again later|temporar/i.test(apiMessage || '');
  return sanitizedError;
}
