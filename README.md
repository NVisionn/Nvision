# NVision Studio — Plataforma de Gestão Audiovisual & Filmmaking

Plataforma profissional de produção audiovisual desenvolvida para produtoras, filmmakers e agências. Integra o fluxo criativo completo entre a **equipe técnica/criação** e o **portal exclusivo do cliente**, garantindo aprovações ágeis, cronogramas de diárias de gravação e roteirização técnica.

---

## 🚀 Principais Módulos & Recursos

### 1. Área da Agência (Painel Operacional)
- **Dashboard Executivo:** Métricas em tempo real de produções ativas, marcações pendentes de confirmação e taxa de ocupação por setor técnico (com semáforo de performance verde/amarelo/vermelho).
- **Projetos em Produção:** Gestão de pipeline por etapas (Briefing, Roteiro, Pré-Produção, Captação/Gravação, Edição/Pós e Entrega Final). Filtros rápidos por cliente, status e barra de busca por título ou descrição.
- **Roteiros & Storytelling:**
  - Criação de escaletas técnicas cena a cena (câmera/vídeo, áudio/locução e segundos por cena).
  - Cálculo dinâmico do tempo total do vídeo.
  - Exportação direta de roteiro profissional em **PDF** formatado.
  - Publicação controlada do roteiro para revisão do cliente.
- **Agenda & Marcações:**
  - Coordenação de diárias de gravação, reuniões de briefing e sessões de aprovação.
  - Detecção inteligente de conflitos de horário entre membros da equipe e clientes.
  - **Como Chegar (Google Maps):** Rota direta no Google Maps para locações presenciais e atalho "Usar endereço da sede do cliente".
  - Disparo de lembretes rápidos via WhatsApp com link direto.
- **Clientes & Negócios Físicos:**
  - Cadastro detalhado com identificação de **Negócio Físico** (lojas, estúdios, consultórios, sedes).
  - Endereço completo com botão **"Como chegar (Google Maps)"** que abre a navegação GPS instantaneamente.
- **Setores & Equipe:**
  - Organização por especialidades (Direção, Roteiro, Captação/Câmera, Áudio, Edição, Motion/VFX, Produção Executiva).
  - Controle de disponibilidade e contagem de produções ativas por profissional.
- **Backup & Segurança:**
  - Exportação e importação de snapshots do sistema em formato JSON com envelope de integridade.
  - Recuperação de senha segura via palavra-chave de segurança.

---

### 2. Portal Exclusivo do Cliente
- **Visão Executiva do Cliente:** Resumo das produções em andamento, status de cada projeto e próxima data na agenda.
- **Localização & Como Chegar:** Se o cliente possuir sede física cadastrada, o portal exibe o card de localização com botão para traçar rota no Google Maps.
- **Aprovação de Roteiros:**
  - Leitura da escaleta cena a cena.
  - Botão de **Aprovação Imediata** ou solicitação de ajustes com comentários integrados.
- **Marcações & Diárias:**
  - Lista de compromissos confirmados, horários, locais e link "Como chegar".
  - Opção para o cliente solicitar novas datas e horários diretamente pelo portal.

---

## 🛠️ Stack Tecnológica

- **Frontend:** React 19, TypeScript, Tailwind CSS, Lucide Icons
- **Backend / Proxy:** Node.js, Express, TSX
- **PDF Generation:** PDF-Lib para geração de roteiros técnicos client-side
- **Autenticação & Armazenamento:** Sessões seguras com tokens assinados (HMAC-SHA256) e hashing de credenciais com `scrypt` e salt aleatório.

---

## 💻 Instalação & Execução Local

```bash
# 1. Clonar o repositório
git clone https://github.com/NVisionn/Nvision.git
cd Nvision

# 2. Instalar dependências
npm install

# 3. Iniciar o servidor de desenvolvimento
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000) no seu navegador para acessar a plataforma.

---

## 📜 Scripts Disponíveis

- `npm run dev`: Inicia o servidor local (porta 3000).
- `npm run build`: Compila os assets de produção com Vite.
- `npm run lint`: Executa a verificação estática de tipos com TypeScript (`tsc --noEmit`).
- `npm test`: Executa os testes unitários do sistema com o test runner nativo do Node.js.

---

Desenvolvido para **NVision Studio** por Daniel Neres.
