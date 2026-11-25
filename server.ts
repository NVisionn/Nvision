import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { SEED_STATE } from './src/data/seedData.ts';
import { mergeAppStates } from './src/lib/nvisionLogic.ts';
import {
  constantTimeEqual,
  generateCreatorInviteCode,
  hashPassword,
  isValidEmail,
  mergeClientScopedState,
  normalizeEmail,
  normalizeSecurityWord,
  readAuthStore,
  scopeStateForClient,
  signAuthToken,
  toPublicAuthUser,
  verifyAuthToken,
  verifyPassword,
  writeAuthStore,
  type StoredAuthUser,
} from './src/lib/serverAuth.ts';
import type { AppState, AuthRole, Client } from './src/types/nvision.ts';

const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'nvision-db-v2.json');
const AUTH_FILE = path.join(DATA_DIR, 'nvision-auth.json');

interface AuthenticatedRequest extends Request {
  authUser?: StoredAuthUser;
}

function readDatabase(): AppState {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(SEED_STATE, null, 2), 'utf-8');
      return SEED_STATE;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed || !Array.isArray(parsed.clients) || !Array.isArray(parsed.projects)) {
      return SEED_STATE;
    }
    return parsed;
  } catch {
    return SEED_STATE;
  }
}

function writeDatabase(state: AppState): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Autenticação necessária. Faça login para continuar.' });
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  const payload = verifyAuthToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
    return;
  }
  const store = readAuthStore(AUTH_FILE);
  const user = store.users.find((u) => u.id === payload.sub);
  if (!user || user.role !== payload.role) {
    res.status(401).json({ error: 'Conta não encontrada ou sessão expirada.' });
    return;
  }
  req.authUser = user;
  next();
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'nvision-studio' });
  });

  app.get('/api/auth/status', (_req, res) => {
    const store = readAuthStore(AUTH_FILE);
    const hasCreator = store.users.some((u) => u.role === 'creator');
    const envCode = (process.env.NVISION_CREATOR_CODE ?? '').trim();
    const envCodeConfigured = envCode.length > 0;
    const requiresCreatorCode = envCodeConfigured || hasCreator;
    res.json({ hasCreator, requiresCreatorCode, envCodeConfigured });
  });

  app.post('/api/auth/register', (req, res) => {
    const body = req.body as {
      name?: unknown;
      email?: unknown;
      password?: unknown;
      role?: unknown;
      company?: unknown;
      phone?: unknown;
      creatorCode?: unknown;
      securityWord?: unknown;
    };

    const role: AuthRole | null =
      body?.role === 'creator' || body?.role === 'client' ? body.role : null;
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const company = typeof body?.company === 'string' ? body.company.trim() : '';
    const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
    const creatorCode = typeof body?.creatorCode === 'string' ? body.creatorCode.trim() : '';
    const securityWord =
      typeof body?.securityWord === 'string' ? normalizeSecurityWord(body.securityWord) : '';

    if (!role) {
      res.status(400).json({ error: 'Selecione se você é Criador ou Cliente.' });
      return;
    }
    if (name.length < 2 || name.length > 120) {
      res.status(400).json({ error: 'Informe seu nome completo.' });
      return;
    }
    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Informe um e-mail válido.' });
      return;
    }
    if (password.length < 6 || password.length > 128) {
      res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
      return;
    }
    if (securityWord.length < 3 || securityWord.length > 80) {
      res.status(400).json({
        error: 'Escolha uma palavra de segurança com pelo menos 3 caracteres para recuperação de senha.',
      });
      return;
    }

    const store = readAuthStore(AUTH_FILE);
    if (store.users.some((u) => normalizeEmail(u.email) === email)) {
      res.status(409).json({ error: 'Este e-mail já está cadastrado. Use a aba Entrar.' });
      return;
    }

    const now = new Date().toISOString();
    let generatedCreatorCode: string | undefined;

    if (role === 'creator') {
      const envCode = (process.env.NVISION_CREATOR_CODE ?? '').trim();
      const hasCreator = store.users.some((u) => u.role === 'creator');

      if (envCode.length > 0) {
        if (!creatorCode || !constantTimeEqual(creatorCode, envCode)) {
          res.status(403).json({
            error: 'Código de equipe inválido para cadastro de Criador.',
          });
          return;
        }
      } else if (hasCreator) {
        if (!store.creatorInviteHash || !creatorCode || !verifyPassword(creatorCode, store.creatorInviteHash)) {
          res.status(403).json({
            error: 'Já existe um Criador cadastrado. Informe o código da equipe para criar outro acesso de Criador.',
          });
          return;
        }
      } else {
        generatedCreatorCode = generateCreatorInviteCode();
        store.creatorInviteHash = hashPassword(generatedCreatorCode);
      }

      const newUser: StoredAuthUser = {
        id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name,
        email,
        role: 'creator',
        passwordHash: hashPassword(password),
        securityWordHash: hashPassword(securityWord),
        createdAt: now,
      };
      store.users.push(newUser);
      writeAuthStore(AUTH_FILE, store);

      const token = signAuthToken(newUser);
      res.status(201).json({
        token,
        user: toPublicAuthUser(newUser),
        ...(generatedCreatorCode ? { generatedCreatorCode } : {}),
      });
      return;
    }

    // Client registration
    if (company.length < 2 || company.length > 120) {
      res.status(400).json({ error: 'Informe o nome da sua empresa ou marca.' });
      return;
    }

    const db = readDatabase();
    let matchedClient = db.clients.find(
      (c) => normalizeEmail(c.email || '') === email
    );

    if (!matchedClient) {
      const newClient: Client = {
        id: `cli-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name,
        company,
        email,
        phone: phone.slice(0, 40),
        segment: 'Geral',
        notes: 'Cadastrado pelo Portal do Cliente.',
        updatedAt: now,
      };
      db.clients = [newClient, ...db.clients];
      db.updatedAt = now;
      writeDatabase(db);
      matchedClient = newClient;
    }

    const newClientUser: StoredAuthUser = {
      id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      email,
      role: 'client',
      clientId: matchedClient.id,
      company: matchedClient.company,
      phone: phone.slice(0, 40),
      passwordHash: hashPassword(password),
      securityWordHash: hashPassword(securityWord),
      createdAt: now,
    };
    store.users.push(newClientUser);
    writeAuthStore(AUTH_FILE, store);

    const token = signAuthToken(newClientUser);
    res.status(201).json({
      token,
      user: toPublicAuthUser(newClientUser),
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const body = req.body as {
      email?: unknown;
      password?: unknown;
      expectedRole?: unknown;
    };

    const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const expectedRole: AuthRole | undefined =
      body?.expectedRole === 'creator' || body?.expectedRole === 'client'
        ? body.expectedRole
        : undefined;

    if (!isValidEmail(email) || !password) {
      res.status(400).json({ error: 'Informe e-mail e senha para entrar.' });
      return;
    }

    const store = readAuthStore(AUTH_FILE);
    const user = store.users.find((u) => normalizeEmail(u.email) === email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: 'E-mail ou senha incorretos.' });
      return;
    }

    if (expectedRole && user.role !== expectedRole) {
      res.status(403).json({
        error:
          user.role === 'creator'
            ? 'Esta conta pertence à área de Criador. Selecione a aba "Sou Criador" para entrar.'
            : 'Esta conta pertence à área de Cliente. Selecione a aba "Sou Cliente" para entrar.',
      });
      return;
    }

    const token = signAuthToken(user);
    res.json({
      token,
      user: toPublicAuthUser(user),
    });
  });

  app.post('/api/auth/reset-password', (req, res) => {
    const body = req.body as {
      email?: unknown;
      securityWord?: unknown;
      newPassword?: unknown;
      expectedRole?: unknown;
    };

    const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
    const securityWord =
      typeof body?.securityWord === 'string' ? normalizeSecurityWord(body.securityWord) : '';
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';
    const expectedRole: AuthRole | undefined =
      body?.expectedRole === 'creator' || body?.expectedRole === 'client'
        ? body.expectedRole
        : undefined;

    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Informe um e-mail válido.' });
      return;
    }
    if (securityWord.length < 3) {
      res.status(400).json({ error: 'Informe a palavra de segurança cadastrada.' });
      return;
    }
    if (newPassword.length < 6 || newPassword.length > 128) {
      res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres.' });
      return;
    }

    const store = readAuthStore(AUTH_FILE);
    const user = store.users.find((u) => normalizeEmail(u.email) === email);

    if (
      !user ||
      !user.securityWordHash ||
      !verifyPassword(securityWord, user.securityWordHash)
    ) {
      res.status(401).json({
        error: 'E-mail ou palavra de segurança incorretos.',
      });
      return;
    }

    if (expectedRole && user.role !== expectedRole) {
      res.status(403).json({
        error:
          user.role === 'creator'
            ? 'Esta conta pertence à área de Criador. Selecione a aba "Sou Criador" para redefinir.'
            : 'Esta conta pertence à área de Cliente. Selecione a aba "Sou Cliente" para redefinir.',
      });
      return;
    }

    user.passwordHash = hashPassword(newPassword);
    writeAuthStore(AUTH_FILE, store);
    res.json({
      ok: true,
      message: 'Senha redefinida com sucesso! Entre com sua nova senha.',
    });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({ user: toPublicAuthUser(req.authUser!) });
  });

  app.post('/api/auth/creator-code', requireAuth, (req: AuthenticatedRequest, res) => {
    if (req.authUser?.role !== 'creator') {
      res.status(403).json({ error: 'Apenas criadores podem atualizar o código da equipe.' });
      return;
    }
    const envCode = (process.env.NVISION_CREATOR_CODE ?? '').trim();
    if (envCode.length > 0) {
      res.status(400).json({
        error: 'O código da equipe está definido via variável de ambiente NVISION_CREATOR_CODE.',
      });
      return;
    }
    const rawCode = typeof req.body?.newCode === 'string' ? req.body.newCode.trim() : '';
    const nextCode = rawCode.length > 0 ? rawCode : generateCreatorInviteCode();
    if (nextCode.length < 4 || nextCode.length > 64) {
      res.status(400).json({ error: 'O código da equipe deve ter entre 4 e 64 caracteres.' });
      return;
    }
    const store = readAuthStore(AUTH_FILE);
    store.creatorInviteHash = hashPassword(nextCode);
    writeAuthStore(AUTH_FILE, store);
    res.json({ ok: true, creatorCode: nextCode });
  });

  app.post('/api/auth/reset-accounts', requireAuth, (req: AuthenticatedRequest, res) => {
    if (req.authUser?.role !== 'creator') {
      res.status(403).json({ error: 'Apenas criadores podem resetar os logins salvos.' });
      return;
    }
    writeAuthStore(AUTH_FILE, { users: [] });
    res.json({ ok: true });
  });

  app.get('/api/state', requireAuth, (req: AuthenticatedRequest, res) => {
    const state = readDatabase();
    const user = req.authUser!;
    if (user.role === 'client') {
      res.json(scopeStateForClient(state, user.clientId ?? ''));
      return;
    }
    res.json(state);
  });

  app.post('/api/sync', requireAuth, (req: AuthenticatedRequest, res) => {
    const incoming = req.body as Partial<AppState> | undefined;
    if (!incoming || !Array.isArray(incoming.clients) || !Array.isArray(incoming.projects)) {
      res.status(400).json({ error: 'Payload de sincronização inválido.' });
      return;
    }
    const current = readDatabase();
    const user = req.authUser!;
    if (user.role === 'client') {
      const merged = mergeClientScopedState(current, incoming, user.clientId ?? '');
      writeDatabase(merged);
      res.json(scopeStateForClient(merged, user.clientId ?? ''));
      return;
    }

    const merged = mergeAppStates(incoming as AppState, current);
    writeDatabase(merged);
    res.json(merged);
  });

  const httpServer = http.createServer(app);
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const enableHmr = process.env.ENABLE_HMR === 'true' && process.env.DISABLE_HMR !== 'true';
    if (!enableHmr) {
      process.env.DISABLE_HMR = 'true';
    }
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: enableHmr ? undefined : false,
        hmr: enableHmr ? { server: httpServer } : false,
        watch: enableHmr ? undefined : null,
      },
      appType: 'spa',
    });
    if (!enableHmr) {
      app.get('/@vite/client', (_req, res) => {
        res.type('application/javascript; charset=utf-8').send(`
const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
    sheetsMap.set(id, style);
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    style.remove();
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
export function injectQuery(url) {
  return url;
}
export class ErrorOverlay extends HTMLElement {}
if (typeof customElements !== 'undefined' && !customElements.get('vite-error-overlay')) {
  customElements.define('vite-error-overlay', ErrorOverlay);
}
`);
      });
    }
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`NVision Studio server listening on http://localhost:${PORT}`);
  });
}

startServer();
