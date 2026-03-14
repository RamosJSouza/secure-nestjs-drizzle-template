#!/usr/bin/env bash
# =============================================================================
# rotate-jwt-keys.sh — Rotação segura de chaves RSA para JWT RS256
#
# USO:
#   ./scripts/rotate-jwt-keys.sh [--env-file .env] [--key-dir ./keys] [--bits 4096]
#
# O QUE FAZ:
#   1. Gera novo par de chaves RSA (privada + pública) com tamanho configurável
#   2. Faz backup das chaves anteriores com timestamp
#   3. Imprime as variáveis de ambiente prontas para copiar para .env / secret manager
#   4. NÃO escreve automaticamente em .env (proteção contra overwrite acidental)
#
# ATENÇÃO:
#   - Após rotar, todos os access tokens existentes tornam-se inválidos na próxima
#     validação (o JwtStrategy re-verifica com a nova PUBLIC_KEY).
#   - Refresh tokens em sessões ativas continuarão funcionando até expirar
#     (o refresh endpoint usa apenas o DB, não verifica assinatura JWT do refresh).
#   - Recomendação: rotacionar em janela de manutenção ou com rolling deployment.
# =============================================================================

set -euo pipefail

KEY_DIR="${KEY_DIR:-./keys}"
KEY_BITS="${KEY_BITS:-4096}"
ENV_FILE="${ENV_FILE:-.env}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file) ENV_FILE="$2"; shift 2 ;;
    --key-dir)  KEY_DIR="$2";  shift 2 ;;
    --bits)     KEY_BITS="$2"; shift 2 ;;
    *) echo "Argumento desconhecido: $1"; exit 1 ;;
  esac
done

# ─── Verificar dependências ───────────────────────────────────────────────────
command -v openssl >/dev/null 2>&1 || { echo "❌ openssl não encontrado. Instale OpenSSL >= 3.x"; exit 1; }

OPENSSL_VERSION="$(openssl version | awk '{print $2}')"
echo "🔧 OpenSSL: $OPENSSL_VERSION"
echo "🔑 Tamanho da chave: ${KEY_BITS} bits"
echo "📁 Diretório de chaves: ${KEY_DIR}"
echo ""

mkdir -p "$KEY_DIR"
chmod 700 "$KEY_DIR"

# Garantir que keys/ está no .gitignore
if [ -f .gitignore ] && ! grep -qx "keys/" .gitignore; then
  echo "keys/" >> .gitignore
  echo "⚠️  Adicionado 'keys/' ao .gitignore"
fi

PRIVATE_KEY_PATH="${KEY_DIR}/private.pem"
PUBLIC_KEY_PATH="${KEY_DIR}/public.pem"

if [ -f "$PRIVATE_KEY_PATH" ]; then
  BACKUP_DIR="${KEY_DIR}/backup_${TIMESTAMP}"
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  cp "$PRIVATE_KEY_PATH" "${BACKUP_DIR}/private.pem"
  cp "$PUBLIC_KEY_PATH"  "${BACKUP_DIR}/public.pem" 2>/dev/null || true
  echo "📦 Backup salvo em: ${BACKUP_DIR}"
fi

# ─── Gerar novo par de chaves ─────────────────────────────────────────────────
echo "⏳ Gerando chave privada RSA-${KEY_BITS}..."
openssl genrsa -out "$PRIVATE_KEY_PATH" "$KEY_BITS" 2>/dev/null
chmod 600 "$PRIVATE_KEY_PATH"

echo "⏳ Derivando chave pública..."
openssl rsa -in "$PRIVATE_KEY_PATH" -pubout -out "$PUBLIC_KEY_PATH" 2>/dev/null
chmod 644 "$PUBLIC_KEY_PATH"

# ─── Verificar integridade ────────────────────────────────────────────────────
echo "🔍 Verificando par de chaves..."
MODULUS_PRIVATE="$(openssl rsa -in "$PRIVATE_KEY_PATH" -noout -modulus 2>/dev/null | sha256sum)"
MODULUS_PUBLIC="$(openssl rsa -pubin -in "$PUBLIC_KEY_PATH" -noout -modulus 2>/dev/null | sha256sum)"

if [ "$MODULUS_PRIVATE" != "$MODULUS_PUBLIC" ]; then
  echo "❌ ERRO: módulos da chave privada e pública não correspondem!"
  exit 1
fi
echo "✅ Par de chaves válido e consistente."

# ─── Fingerprint para auditoria ──────────────────────────────────────────────
FINGERPRINT="$(openssl rsa -pubin -in "$PUBLIC_KEY_PATH" -noout -modulus 2>/dev/null | sha256sum | cut -d' ' -f1)"
echo "🔏 Fingerprint da chave pública: ${FINGERPRINT}"

# ─── Exportar como variáveis de ambiente (single-line) ───────────────────────
PRIVATE_KEY_ESCAPED="$(awk 'NF {printf "%s\\n", $0}' "$PRIVATE_KEY_PATH")"
PUBLIC_KEY_ESCAPED="$(awk 'NF {printf "%s\\n", $0}' "$PUBLIC_KEY_PATH")"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  NOVAS VARIÁVEIS DE AMBIENTE (copie para seu secret manager)"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "PRIVATE_KEY=\"${PRIVATE_KEY_ESCAPED}\""
echo ""
echo "PUBLIC_KEY=\"${PUBLIC_KEY_ESCAPED}\""
echo ""
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "⚠️  PASSOS PÓS-ROTAÇÃO:"
echo "   1. Atualize PRIVATE_KEY e PUBLIC_KEY no seu secret manager (AWS SSM, Vault, etc.)"
echo "   2. Faça redeploy da aplicação com as novas chaves"
echo "   3. Access tokens existentes serão invalidados na próxima verificação"
echo "   4. Refresh tokens ativos continuam válidos (não usam assinatura JWT)"
echo "   5. Remova backups antigos após confirmar que o deploy está estável:"
echo "      rm -rf ${KEY_DIR}/backup_*"
echo ""
echo "📋 Auditoria:"
echo "   Fingerprint: ${FINGERPRINT}"
echo "   Timestamp:   ${TIMESTAMP}"
echo "   Key bits:    ${KEY_BITS}"
