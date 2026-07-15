# Deploy seguro na AWS com GitHub OIDC e Systems Manager

Este projeto usa GitHub Actions, credenciais temporarias via OIDC, um bucket S3
privado para transportar o pacote e AWS Systems Manager para executar o deploy.
Nao e necessario liberar SSH para os runners do GitHub.

## Valores usados

Anote antes de comecar:

- `ACCOUNT_ID`: ID de 12 digitos da conta AWS.
- `INSTANCE_ID`: ID da EC2, no formato `i-xxxxxxxxxxxxxxxxx`.
- `REGION`: `sa-east-1`.
- `BUCKET`: um nome globalmente unico, por exemplo
  `api-vagas-viktor-deploy-ACCOUNT_ID`.
- `APP_DIR`: `/home/ec2-user/api-vagas-viktor`.

Substitua esses marcadores nas politicas abaixo.

## 1. Criar o bucket privado

No console AWS, abra **S3 > Criar bucket**:

1. Use o nome escolhido em `BUCKET` e a regiao `sa-east-1`.
2. Mantenha ACLs desabilitadas.
3. Mantenha **Bloquear todo o acesso publico** habilitado.
4. Mantenha a criptografia padrao habilitada.
5. Crie o bucket.

## 2. Dar acesso ao Systems Manager para a EC2

Abra **IAM > Funcoes > Criar funcao**:

1. Tipo de entidade: **Servico da AWS**.
2. Caso de uso: **EC2**.
3. Adicione `AmazonSSMManagedInstanceCore`.
4. Nomeie como `EC2ApiVagasSSMRole` e crie.
5. Dentro da funcao, adicione a seguinte politica em
   **Adicionar permissoes > Criar politica em linha > JSON**:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DownloadDeployArtifact",
      "Effect": "Allow",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::BUCKET/deploy/*"
    }
  ]
}
```

Nomeie a politica como `ApiVagasReadDeployArtifact`.

Abra **EC2 > Instancias**, selecione a instancia e use
**Acoes > Seguranca > Modificar funcao do IAM**. Selecione
`EC2ApiVagasSSMRole` e salve.

Em **Systems Manager > Fleet Manager > Nos gerenciados**, aguarde a instancia
aparecer como online. Tambem e possivel testar em **EC2 > Conectar > Session
Manager > Conectar**.

Se ela nao aparecer, conecte uma ultima vez por SSH e confira:

```bash
sudo systemctl enable --now amazon-ssm-agent
sudo systemctl status amazon-ssm-agent
aws --version
```

## 3. Adicionar o provedor OIDC do GitHub

Abra **IAM > Provedores de identidade > Adicionar provedor**:

1. Tipo: **OpenID Connect**.
2. URL: `https://token.actions.githubusercontent.com`.
3. Publico: `sts.amazonaws.com`.
4. Adicione o provedor.

## 4. Criar a funcao usada pelo GitHub Actions

Abra **IAM > Funcoes > Criar funcao**:

1. Entidade confiavel: **Identidade da Web**.
2. Provedor: `token.actions.githubusercontent.com`.
3. Publico: `sts.amazonaws.com`.
4. Organizacao GitHub: `vla2005`.
5. Repositorio: `api-vagas-viktor`.
6. Branch: `main`.
7. Nome: `GitHubActionsApiVagasDeploy`.

Depois de criar, adicione esta politica em linha, substituindo os marcadores:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ManageDeployArtifact",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::BUCKET/deploy/*"
    },
    {
      "Sid": "RunDeployCommand",
      "Effect": "Allow",
      "Action": "ssm:SendCommand",
      "Resource": [
        "arn:aws:ssm:sa-east-1::document/AWS-RunShellScript",
        "arn:aws:ec2:sa-east-1:ACCOUNT_ID:instance/INSTANCE_ID"
      ]
    },
    {
      "Sid": "ReadDeployCommandResult",
      "Effect": "Allow",
      "Action": "ssm:GetCommandInvocation",
      "Resource": "*"
    }
  ]
}
```

Nomeie a politica como `ApiVagasDeployPolicy`.

Na aba **Relacoes de confianca**, confirme que a condicao `sub` limita o acesso
exatamente a:

```text
repo:vla2005/api-vagas-viktor:ref:refs/heads/main
```

Copie o ARN da funcao. Ele tera este formato:

```text
arn:aws:iam::ACCOUNT_ID:role/GitHubActionsApiVagasDeploy
```

## 5. Configurar o GitHub

Abra o repositorio no GitHub e acesse **Settings > Secrets and variables >
Actions**.

Em **Secrets**, crie:

| Nome | Valor |
| --- | --- |
| `AWS_ROLE_ARN` | ARN da funcao `GitHubActionsApiVagasDeploy` |

Em **Variables**, crie:

| Nome | Valor |
| --- | --- |
| `AWS_REGION` | `sa-east-1` |
| `EC2_INSTANCE_ID` | ID da instancia EC2 |
| `S3_DEPLOY_BUCKET` | Nome do bucket, sem `s3://` |
| `EC2_APP_DIR` | `/home/ec2-user/api-vagas-viktor` |

Os secrets antigos `EC2_HOST`, `EC2_USER`, `EC2_APP_DIR` e `EC2_SSH_KEY` nao
sao mais usados pelo workflow. Remova-os somente depois de validar o novo deploy.

## 6. Publicar e testar

```powershell
git add .github/workflows/deploy.yml docs/aws-oidc-deploy.md
git commit -m "migra deploy para AWS OIDC e Systems Manager"
git push origin main
```

No GitHub, acompanhe **Actions > CI/CD Deploy**. O fluxo deve autenticar via
OIDC, enviar o pacote ao S3, executar o comando via SSM, reiniciar o PM2 e
remover o pacote temporario do bucket.

## 7. Fechar o SSH

Depois do primeiro deploy bem-sucedido:

1. Remova a regra de entrada SSH, porta 22, do grupo de seguranca.
2. Nao exponha a porta 2400; o Node deve continuar acessivel apenas pelo Nginx.
3. Deixe publicas apenas as portas 80 e 443.
4. Use **EC2 > Conectar > Session Manager** para administrar a instancia.
5. Remova do GitHub os secrets antigos de SSH.

A chave `.pem` pode ser mantida em backup privado, mas nao deve ser enviada ao
repositorio nem armazenada novamente no GitHub.
