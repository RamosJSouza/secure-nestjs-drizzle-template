# VULN-01 — Confusão de tokens JWT: Refresh token aceite como Access token

**Severidade:** CRÍTICA
**CVSS 3.1 (estimado):** 9.1 (AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N)
**CWE-346:** Origin Validation Error / **CWE-384:** Session Fixation / **CWE-287:** Improper Authentication
**Ficheiros:**
- `src/auth/auth.service.ts` (assinatura dos tokens — linhas 402-412)
- `src/auth/strategy/jwt.strategy.ts` (validação — linhas 24-46)

---

## 1. Evidência irrefutável (código atual)

### 1.1 Os dois tokens são indistinguíveis na semântica

```402:412:src/auth/auth.service.ts
    const jti = randomUUID();

    const accessToken = this.jwtService.sign(
      { sub: user.id, jti },
      { expiresIn: ACCESS_TOKEN_EXPIRES, algorithm: 'RS256' },
    );

    const refreshToken = this.jwtService.sign(
      { sub: user.id },
      { expiresIn: REFRESH_TOKEN_EXPIRES, algorithm: 'RS256' },
    );
```

- **Access token** = `{ sub, jti }`, TTL 15m, RS256.
- **Refresh token** = `{ sub }` — **sem `jti`, sem `typ`, sem `aud`, sem `iss`** —, TTL **7d**, **mesma chave privada RS256**.

Prova por análise estrutural: pesquisa por `typ|audience|audience|issuer|iss\b` em `src/auth` devolve **apenas** `type: argon2.argon2id` (irrelevante). **Nenhum claim de tipo/audiência/emissor existe.**

### 1.2 A estratégia JWT aceita qualquer token RS256 válido e SÓ verifica revogação se houver `jti`

```24:30:src/auth/strategy/jwt.strategy.ts
  async validate(payload: { sub: string; jti?: string }) {
    if (payload.jti) {
      const revoked = await this.tokenRevocationService.isRevoked(payload.jti);
      if (revoked) {
        throw new UnauthorizedException('Token has been revoked');
      }
    }
```

O guard `if (payload.jti)` é **condicional**. O refresh token **não tem `jti`** → o ramo de revogação é **saltado**. De seguida:

```32:43:src/auth/strategy/jwt.strategy.ts
    const user = await this.usersService.findById(payload.sub);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid token');
    }

    const now = new Date();
    if (user.lockedUntil && user.lockedUntil > now) {
      throw new UnauthorizedException('Account is locked. Try again later.');
    }

    RequestContext.setUser(user.id, user.organizationId ?? undefined);

    return user;
```

`findById(sub)` retorna o utilizador ativo → `validate` **retorna o utilizador** → o `JwtAuthGuard` e o `PermissionGuard` autorizam o pedido com **RBAC completo**.

### 1.3 Logout / change-password / revogação NÃO invalidam um refresh token usado como access token

- `auth.service.ts:360-392` (`logout`) — revoga a **linha da sessão** no DB e adiciona o **`accessTokenJti`** ao Redis. **Não** invalida a **assinatura** do refresh token.
- `auth.service.ts:452-506` (`changePassword`) — revoga todas as sessões + todos os JTIs conhecidos. Novamente: **não** toca no refresh token enquanto JWT.
- O `JwtStrategy` **não consulta a tabela `sessions`** nem o `refreshTokenHash`. Para um refresh token usado como Bearer, **não existe qualquer verificação de sessão** — apenas `jti` (ausente) e `findById(sub)`.

**Consequência:** um refresh token roubado, usado como access token, **permanece válido durante 7 dias mesmo que a vítima faça logout e altere a password**. A única forma de o matar é desativar/apagar o utilizador (`findById` filtra `deletedAt`/`isActive`) — e mesmo assim só porque a lookup do utilizador falha, não porque o token seja revogado.

---

## 2. Modelo de Ameaça tático

**Atacante:** qualquer entidade que obtenha um refresh token da vítima — XSS, MitM (sem HSTS/SSL pinning), log de erro que registe o body, partilha de dispositivo, comprometimento de uma cache/proxy, acesso a ficheiros de sessão do browser, etc. **Não** precisa da password.

**Limite de confiança comprometido:** o *Token Validation Boundary* do `JwtStrategy`. O sistema assume implicitamente que "todo o JWT RS256 com `sub` válido apresentado no header `Authorization: Bearer` é um access token". Esta pressuposição é falsa.

**Cadeia de exploração (kill-chain):**

1. **Reconhecimento/Obtenção:** atacante obtém o refresh token `R` da vítima (vetor fora do âmbito, mas trivial em muitas apps).
2. **Bypass do boundary:** em vez de usar `R` em `POST /auth/refresh` (o caminho legítimo, que o rodaria e o faria expirar), o atacante apresenta-o como access token:
   `Authorization: Bearer <R>` num endpoint protegido por `JwtAuthGuard` (ex.: `/auth/logout`, `/auth/change-password`, ou qualquer rota RBAC).
3. **Autorização sem revogação:** `JwtStrategy.validate({ sub })` → sem `jti` → **salta o check Redis** → `findById(sub)` → utilizador ativo → retorna user → `PermissionGuard` valida RBAC → **200/204**.
4. **Persistência pós-logout/password-change:** a vítima deteta atividade suspeita e (a) faz logout, (b) altera a password. Ambas as ações revogam **sessões** e **JTIs de access tokens**, mas **não** a assinatura RS256 de `R`. O atacante **continua autenticado até à expiração natural de 7 dias** do refresh token.
5. **Escalada lateral:** como o `PermissionGuard` confia no `user.roleId` retornado por `validate`, o atacante opera com **os mesmos privilégios** da vítima (incl. `users:create` se for admin).

**Vias de exploração concretas expostas:**
- `POST /auth/logout` → 204 com `Bearer: <refresh>` (prova de autenticação aceita).
- `POST /auth/change-password` → permite iniciar o fluxo (corpo precisa de `currentPassword`, mas o *guard* já passou).
- Qualquer rota com `@RequirePermissions(...)` → autorizada com o `roleId` da vítima.

---

## 3. Prova de Conceito

Ficheiro: `poc-vuln-01.py`

```python
poc-vuln-01.py
```
Ver `poc-vuln-01.py` neste diretório. Demonstração:

1. Login como vítima → obter `access_token` (A0) e `refresh_token` (R).
2. **Ataque 1:** usar **R** como Bearer em `POST /auth/logout` → espera-se 401, **obtém-se 204** (autenticação aceita). Prova que o refresh token passa o `JwtStrategy`.
3. **Ataque 2 (persistência):** a vítima faz logout legítimo (revoga a sessão) e altera a password (revoga todas as sessões + JTIs). O atacante **continua** a usar R como Bearer num endpoint protegido → **continua 200/204** durante até 7 dias, porque nenhuma revogação cobre a assinatura do refresh token.

curl equivalente (Ataque 1):

```bash
# 1) Login legitimo
RESP=$(curl -s -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"victim@example.com","password":"..."}')
REFRESH=$(echo "$RESP" | jq -r .refresh_token)

# 2) Usar o REFRESH TOKEN como se fosse ACCESS TOKEN num endpoint protegido
curl -i -X POST http://localhost:3000/auth/logout \
  -H "Authorization: Bearer $REFRESH" \
  -H 'Content-Type: application/json' \
  -d "{\"refresh_token\":\"$REFRESH\"}"
# Esperado (seguro): 401
# Real (vulneravel):  204 No Content   <-- BUG
```

---

## 4. Patch de remediação idiomático NestJS

Estratégia: **discriminação por claim `typ`** + verificação explícita em cada caminho de validação. Adicionalmente, `aud`/`iss` para defesa em profundidade. O `jti` deve existir em **ambos** os tokens (o refresh token ganha um `jti` próprio para permitir revogação granular).

### 4.1 Constantes de claims

```ts
// src/auth/token-types.ts
export const TOKEN_TYPE = {
  ACCESS: 'access',
  REFRESH: 'refresh',
} as const;

export const TOKEN_ISSUER = 'secure-nestjs-drizzle';
export const TOKEN_AUDIENCE = 'urn:secure-nestjs-drizzle:api';
```

### 4.2 Assinatura — `auth.service.ts`

```ts
import { randomUUID } from 'crypto';
import { TOKEN_TYPE, TOKEN_ISSUER, TOKEN_AUDIENCE } from './token-types';

const COMMON_SIGN_OPTIONS = {
  algorithm: 'RS256' as const,
  issuer: TOKEN_ISSUER,
  audience: TOKEN_AUDIENCE,
};

// dentro de createTokensAndSession():
const accessJti = randomUUID();
const refreshJti = randomUUID();

const accessToken = this.jwtService.sign(
  { sub: user.id, jti: accessJti, typ: TOKEN_TYPE.ACCESS },
  { ...COMMON_SIGN_OPTIONS, expiresIn: ACCESS_TOKEN_EXPIRES },
);

const refreshToken = this.jwtService.sign(
  { sub: user.id, jti: refreshJti, typ: TOKEN_TYPE.REFRESH },
  { ...COMMON_SIGN_OPTIONS, expiresIn: REFRESH_TOKEN_EXPIRES },
);

// guardar AMBOS os jtis na sessao para revogacao granular
await this.db.insert(sessions).values({
  userId: user.id,
  refreshTokenHash,
  accessTokenJti: accessJti,
  refreshTokenJti: refreshJti, // novo campo no schema
  // ...resto inalterado
});
```

> Nota: adicionar `refreshTokenJti` ao schema `sessions` permite revogar o refresh-token-as-access via `isRevoked(refreshJti)` quando o `jti` passar a ser sempre verificado.

### 4.3 Validação de access token — `jwt.strategy.ts`

```ts
import { TOKEN_TYPE, TOKEN_ISSUER, TOKEN_AUDIENCE } from '../token-types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService, usersService, tokenRevocationService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('keys.publicKey'),
      algorithms: ['RS256'],
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    });
  }

  async validate(payload: { sub: string; jti: string; typ: string }) {
    // Guarda de tipo: apenas access tokens sao aceites aqui.
    if (payload.typ !== TOKEN_TYPE.ACCESS) {
      throw new UnauthorizedException('Invalid token type');
    }

    // O jti passa a ser OBRIGATORIO para access tokens.
    if (!payload.jti) {
      throw new UnauthorizedException('Token missing jti');
    }

    const revoked = await this.tokenRevocationService.isRevoked(payload.jti);
    if (revoked) {
      throw new UnauthorizedException('Token has been revoked');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid token');
    }
    // ... lockedUntil check inalterado
    return user;
  }
}
```

### 4.4 Validação de refresh token — `auth.service.ts` (`refresh`)

```ts
async refresh(dto: RefreshDto, ip?: string, userAgent?: string) {
  const token = dto.refresh_token;

  let payload: { sub: string; jti: string; typ: string; exp: number };
  try {
    payload = this.jwtService.verify(token, {
      algorithms: ['RS256'],
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    });
  } catch {
    throw new UnauthorizedException('Invalid or expired refresh token');
  }

  if (payload.typ !== TOKEN_TYPE.REFRESH) {
    // Um access token tentado ser usado como refresh -> rejeitar explicitamente.
    throw new UnauthorizedException('Invalid token type');
  }

  // ... resto inalterado, mas usar payload.jti para revogacao opcional do refresh
}
```

### 4.5 Garantias do patch

- **Confusão de tipo eliminada:** um refresh token apresentado como access token falha em `payload.typ !== 'access'`.
- **Revogação universal:** ambos os tokens têm `jti`; o `JwtStrategy` **sempre** verifica `isRevoked(jti)` (sem ramo condicional).
- **Defesa em profundidade:** `iss`/`aud` rejeitam tokens emitidos por outro emissor/para outra audiência.
- **Logout/password-change passam a revogar o `refreshTokenJti`** também → o refresh token roubado deixa de ser válido como access token após essas ações.
